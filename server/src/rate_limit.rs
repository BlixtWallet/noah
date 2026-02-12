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
    let config = GovernorConfigBuilder::default()
        .per_second(5)
        .burst_size(60)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("Failed to create rate limiter config");

    GovernorLayer::new(config)
}

/// Creates a rate limiting layer for authenticated endpoints
/// This is less restrictive as users are already authenticated
pub fn create_auth_rate_limiter() -> RateLimiter {
    let config = GovernorConfigBuilder::default()
        .per_second(10)
        .burst_size(120)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("Failed to create rate limiter config");

    GovernorLayer::new(config)
}

/// Creates a dedicated rate limiting layer for public autocomplete suggestions.
pub fn create_suggestions_rate_limiter() -> RateLimiter {
    let config = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(20)
        .key_extractor(SmartIpKeyExtractor)
        .finish()
        .expect("Failed to create suggestions rate limiter config");

    GovernorLayer::new(config)
}
