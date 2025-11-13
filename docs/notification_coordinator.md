# Notification Coordination System

## Overview

The notification coordination system prevents overlapping push notifications and ensures mobile devices have adequate time to complete background tasks. This solves critical issues where multiple notifications arriving simultaneously would cause jobs to fail due to mobile OS background execution time limits.

## The Problem

Previously, our notification system had several critical issues:

1. **Cron Job Overlaps**: Different cron schedules (every 2h, 12h, 48h) inevitably overlap at certain times
2. **Simultaneous Notifications**: Maintenance and offboarding notifications could trigger at the same time
3. **Mobile OS Constraints**: iOS and Android give limited background execution time (typically 30 seconds)
4. **Competing Jobs**: When multiple notifications arrive simultaneously, jobs compete for resources and at least one will likely fail
5. **No Coordination**: Each notification type fired independently without awareness of others

### Example Overlap Scenario

```
Time 0h:  Backup notification sent
Time 2h:  Backup notification sent
Time 4h:  Backup notification sent
Time 6h:  Backup notification sent
Time 8h:  Backup notification sent
Time 10h: Backup notification sent
Time 12h: Backup + Deregister notifications sent (OVERLAP!)
```

When two notifications arrive within seconds of each other, the mobile OS wakes the app twice in rapid succession. The OS only provides ~30 seconds of background time, and both jobs compete for:
- Network resources
- Wallet state access
- Database locks
- CPU time

Result: At least one job fails, potentially corrupting wallet state.

## The Solution

### Notification Coordinator

A centralized `NotificationCoordinator` that:

1. **Tracks notification timing** per user in a database
2. **Enforces minimum spacing** between notifications (default: 45 minutes)
3. **Implements priority levels** for critical vs normal notifications
4. **Handles special cases** (offboarding users don't get maintenance notifications)
5. **Provides coordination** across all notification types

### Key Components

#### 1. Database Schema

```sql
CREATE TABLE notification_tracking (
    pubkey TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    last_sent_at TIMESTAMP NOT NULL,
    PRIMARY KEY (pubkey, notification_type),
    FOREIGN KEY (pubkey) REFERENCES users(pubkey)
);
```

This tracks when each notification type was last sent to each user.

#### 2. Priority Levels

```rust
pub enum NotificationPriority {
    /// Critical notifications that must go out immediately
    /// (offboarding, maintenance)
    Critical,
    
    /// Normal notifications that respect spacing rules
    /// (backup, heartbeat)
    Normal,
}
```

#### 3. Spacing Rules

- **Normal Priority**: Must wait `notification_spacing_minutes` (default 45 min) since ANY previous notification
- **Critical Priority**: Can send immediately, bypassing spacing rules
- **Special Case**: Offboarding users skip maintenance notifications (offboarding takes priority)

## Configuration

Add to your `config.toml`:

```toml
# Minimum minutes between notifications to the same user
# Default: 45 minutes
notification_spacing_minutes = 45
```

This is hot-reloadable - changes apply without restarting the server.

### Recommended Values

- **Production**: 45-60 minutes (safe for most devices)
- **Testing**: 1-5 minutes (faster feedback)
- **Development**: 0 minutes (no spacing, immediate delivery)

## Usage Examples

### Broadcasting a Normal Priority Notification

```rust
use crate::notification_coordinator::{
    NotificationCoordinator, NotificationPriority, NotificationRequest
};

async fn send_backup_notifications(app_state: AppState) -> Result<()> {
    let coordinator = NotificationCoordinator::new(app_state.clone());
    
    let notification_data = NotificationData::BackupTrigger(
        BackupTriggerNotification { k1: String::new() }
    );
    
    let request = NotificationRequest {
        priority: NotificationPriority::Normal,
        data: notification_data,
        target_pubkey: None, // Broadcast to eligible users
    };
    
    coordinator.send_notification(request).await?;
    Ok(())
}
```

### Sending a Critical Notification to Specific User

```rust
async fn send_offboarding_notification(
    app_state: AppState,
    pubkey: String,
    request_id: String,
) -> Result<()> {
    let coordinator = NotificationCoordinator::new(app_state);
    
    let notification_data = NotificationData::Offboarding(
        OffboardingNotification {
            k1: String::new(),
            offboarding_request_id: request_id,
            address: "bc1q...".to_string(),
            address_signature: "...".to_string(),
        }
    );
    
    let request = NotificationRequest {
        priority: NotificationPriority::Critical,
        data: notification_data,
        target_pubkey: Some(pubkey),
    };
    
    coordinator.send_notification(request).await?;
    Ok(())
}
```

## Notification Type Matrix

| Type | notification_type() | Priority | Broadcast | Spacing | Special Rules |
|------|---------------------|----------|-----------|---------|---------------|
| **Maintenance** | `"maintenance"` | Critical | Yes | Bypassed | Skipped for offboarding users |
| **Offboarding** | `"offboarding"` | Critical | No (targeted) | Bypassed | Takes priority over maintenance |
| **BackupTrigger** | `"backup_trigger"` | Normal | Yes | Enforced | Only to users with backup enabled |
| **Heartbeat** | `"heartbeat"` | Normal | Yes | Enforced | Only to active users |
| **LightningInvoiceRequest** | `"lightning_invoice_request"` | N/A | No (targeted) | N/A | Sent on LNURL payment request |

## How It Works

### Normal Priority Flow

```
1. Cron job triggers backup notification
2. Coordinator queries eligible users:
   - Users with backup enabled
   - AND no notification in last 45 minutes
3. For each eligible user:
   a. Check if user is offboarding (skip if needed)
   b. Send notification
   c. Record timestamp in notification_tracking
4. Log results (sent count, skipped count)
```

### Critical Priority Flow

```
1. Round starts, maintenance triggered
2. Coordinator processes all users:
   a. Check if user is offboarding
      - If yes: skip maintenance
      - If no: send immediately (bypass spacing)
   b. Send notification
   c. Record timestamp in notification_tracking
3. Offboarding requests processed:
   a. Send offboarding notification immediately
   b. Record timestamp in notification_tracking
```

### Example Timeline with Coordination

```
Time 0:00  - User receives backup notification
Time 0:30  - Heartbeat cron tries to send → SKIPPED (30 min < 45 min)
Time 0:45  - Maintenance round starts → SENT (critical priority)
Time 1:30  - Backup cron tries to send → SENT (45+ min since last)
Time 2:00  - User requests offboarding → SENT (critical priority)
Time 2:15  - Maintenance round starts → SKIPPED (user is offboarding)
```

## Benefits

### 1. No More Job Conflicts
Each user receives at most one notification per 45-minute window (except critical), preventing competing background tasks.

### 2. Predictable Resource Usage
Mobile devices can reliably complete background work with adequate time and resources.

### 3. Better User Experience
- Fewer unnecessary wake-ups conserve battery
- Notifications arrive at spaced intervals
- Critical operations (offboarding) aren't blocked by routine maintenance

### 4. Reduced Failure Rates
Jobs no longer fail due to resource contention or timeout issues.

### 5. Flexibility
Critical operations can still bypass rules when necessary, while routine notifications are coordinated.

## Monitoring & Debugging

### Check Notification History for a User

```sql
SELECT notification_type, last_sent_at
FROM notification_tracking
WHERE pubkey = 'user_pubkey_here'
ORDER BY last_sent_at DESC;
```

### Find Users Eligible for Notification

```sql
SELECT u.pubkey
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM notification_tracking nt
    WHERE nt.pubkey = u.pubkey AND nt.last_sent_at > datetime('now', '-45 minutes')
);
```

### View Recent Notification Activity

```sql
SELECT pubkey, notification_type, last_sent_at
FROM notification_tracking
WHERE last_sent_at > datetime('now', '-24 hours')
ORDER BY last_sent_at DESC
LIMIT 100;
```

## Testing

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_normal_priority_respects_spacing() {
        // Setup: User received notification 30 minutes ago
        // Action: Try to send normal priority notification
        // Assert: Notification is skipped
    }

    #[tokio::test]
    async fn test_critical_priority_bypasses_spacing() {
        // Setup: User received notification 5 minutes ago
        // Action: Send critical priority notification
        // Assert: Notification is sent
    }

    #[tokio::test]
    async fn test_offboarding_skips_maintenance() {
        // Setup: User has pending offboarding request
        // Action: Try to send maintenance notification
        // Assert: Notification is skipped
    }
}
```

### Integration Tests

1. **Cron Overlap Test**: Schedule multiple crons at same time, verify only one notification per user
2. **Priority Test**: Send critical notification immediately after normal, verify both arrive
3. **Spacing Test**: Rapid-fire normal notifications, verify spacing is enforced
4. **Offboarding Test**: Trigger maintenance during offboarding, verify maintenance skipped

## Migration Path

The system automatically migrates with migration v8. On first run after deployment:

```
INFO Running migration v8: create_notification_tracking_table
INFO Migration v8 completed
```

Existing users have no notification history, so first notifications go immediately. After that, spacing rules apply.

## Performance Considerations

### Database Queries

- **Read**: Single indexed query per notification check
- **Write**: Single UPSERT per notification sent
- **Indexes**: On `pubkey` and `last_sent_at` for fast queries

### Scalability

- **100 users**: Negligible overhead (<1ms per notification)
- **10,000 users**: ~100ms total for broadcast coordination
- **100,000 users**: Consider batching and async processing

### Memory Usage

Minimal - no in-memory state required. All coordination through database.

## Future Enhancements

### Potential Improvements

1. **Notification Queue**: Queue notifications that are rate-limited and retry later
2. **Per-Type Spacing**: Different spacing rules per notification type
3. **Time Windows**: Prevent notifications during user's sleep hours
4. **Adaptive Spacing**: Increase spacing for users who consistently fail jobs
5. **Notification Groups**: Combine multiple pending notifications into one wake-up

### Metrics to Track

- Notification send success rate
- Time between notifications (actual vs configured)
- Job completion rates before/after coordination
- Number of skipped notifications per type

## Troubleshooting

### Notifications Not Being Sent

1. Check spacing: Query `notification_tracking` for user
2. Verify priority: Critical should bypass spacing
3. Check eligibility: User must exist, have push token, meet type-specific criteria
4. Review logs: Search for "Skipping" or "coordination rules"

### Notifications Overlapping

1. Verify config: Check `notification_spacing_minutes` value
2. Check priority: Both might be critical (intentional)
3. Review database: Ensure `notification_tracking` is being updated
4. Check timestamps: Ensure server clock is correct

### User Not Receiving Any Notifications

1. Check push token: Verify user has valid token registered
2. Check user status: Ensure user exists and is active
3. Check device: Verify device has notifications enabled
4. Review job reports: Check if notifications sent but jobs failed

## Summary

The notification coordination system solves critical reliability issues by:

- Preventing overlapping notifications that cause job failures
- Enforcing minimum spacing between wake-ups (45 min default)
- Prioritizing critical operations (offboarding, maintenance)
- Coordinating across all notification types
- Providing special handling for edge cases (offboarding users)

This ensures mobile devices can reliably complete background work while conserving battery and preventing resource contention.