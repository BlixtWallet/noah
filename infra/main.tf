terraform {
  required_version = ">= 1.0"
  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.4"
    }
  }
}

provider "railway" {
  token = var.railway_token
}

# ========================================
# Railway Project
# ========================================
resource "railway_project" "noah" {
  name = var.project_name
}

# ========================================
# NOTE: PostgreSQL and Redis
# ========================================
# Railway databases should be added via the dashboard using their templates:
# 1. Go to your project in Railway dashboard
# 2. Click "+ New" -> "Database" -> "PostgreSQL"
# 3. Click "+ New" -> "Database" -> "Redis"
#
# Railway will auto-generate connection URLs that you can reference
# in your service variables using the syntax:
#   ${{Postgres.DATABASE_URL}}
#   ${{Redis.REDIS_URL}}
# ========================================

# ========================================
# Noah Server Service
# ========================================
resource "railway_service" "server" {
  project_id         = railway_project.noah.id
  name               = "noah-server"
  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  root_directory     = "/"
}

# ========================================
# Server Configuration Variables
# ========================================
resource "railway_variable_collection" "server" {
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id

  variables = [
    # Server binding
    { name = "PORT", value = "3000" },
    { name = "PRIVATE_PORT", value = "3099" },
    { name = "HOST", value = "0.0.0.0" },

    # Database connections - using Railway's reference syntax
    # These reference the Postgres and Redis services added via dashboard
    { name = "POSTGRES_URL", value = "$${{Postgres.DATABASE_URL}}" },
    { name = "REDIS_URL", value = "$${{Redis.REDIS_URL}}" },

    # Server configuration
    { name = "SERVER_NETWORK", value = var.server_network },
    { name = "LNURL_DOMAIN", value = var.lnurl_domain },
    { name = "ARK_SERVER_URL", value = var.ark_server_url },
    { name = "MINIMUM_APP_VERSION", value = var.minimum_app_version },

    # Push notifications
    { name = "EXPO_ACCESS_TOKEN", value = var.expo_access_token },

    # AWS S3 backups
    { name = "S3_BUCKET_NAME", value = var.s3_bucket_name },
    { name = "AWS_ACCESS_KEY_ID", value = var.aws_access_key_id },
    { name = "AWS_SECRET_ACCESS_KEY", value = var.aws_secret_access_key },
    { name = "AWS_REGION", value = var.aws_region },

    # Build configuration
    { name = "RAILWAY_DOCKERFILE_PATH", value = "infra/Dockerfile.railway" },
  ]
}

# Optional variables added separately
resource "railway_variable" "sentry_url" {
  count          = var.sentry_url != "" ? 1 : 0
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id
  name           = "SENTRY_URL"
  value          = var.sentry_url
}

resource "railway_variable" "ntfy_auth_token" {
  count          = var.ntfy_auth_token != "" ? 1 : 0
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id
  name           = "NTFY_AUTH_TOKEN"
  value          = var.ntfy_auth_token
}

# ========================================
# Public Domain for Server
# ========================================
resource "railway_service_domain" "server" {
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id
  subdomain      = var.project_name
}

# ========================================
# Custom Domain (optional)
# ========================================
resource "railway_custom_domain" "server" {
  count          = var.custom_domain != "" ? 1 : 0
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id
  domain         = var.custom_domain
}
