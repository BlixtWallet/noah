use axum::body::Body;
use tower_governor::{
    GovernorLayer, governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor,
};

// Type alias to simplify the return type
type RateLimiter = GovernorLayer<
    SmartIpKeyExtractor,
    governor::middleware::NoOpMiddleware<governor::clock::QuantaInstant>,
    Body,
>;

/// Creates a rate limiting layer for public endpoints like getk1
/// This is more restrictive to prevent abuse
pub fn create_public_rate_limiter() -> RateLimiter {
    // 30 requests per minute per IP with burst capability
    let config = GovernorConfigBuilder::default()
        .per_second(2) // Replenish 2 tokens per second (120 per minute steady state)
        .burst_size(30) // Allow bursts of up to 30 requests
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("Failed to create rate limiter config");

    GovernorLayer::new(config)
}

/// Creates a rate limiting layer for authenticated endpoints
/// This is less restrictive as users are already authenticated
pub fn create_auth_rate_limiter() -> RateLimiter {
    // 60 requests per minute per IP with burst capability
    let config = GovernorConfigBuilder::default()
        .per_second(5) // Replenish 5 tokens per second (300 per minute steady state)
        .burst_size(60) // Allow bursts of up to 60 requests
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("Failed to create rate limiter config");

    GovernorLayer::new(config)
}
