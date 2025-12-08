terraform {
  required_version = ">= 1.0"
  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "railway" {
  token = var.railway_token
}

# ========================================
# Auto-generated PostgreSQL password
# ========================================
resource "random_password" "postgres" {
  length           = 32
  special          = true
  override_special = "!#$%&*-_=+<>?"
}

# ========================================
# Railway Project
# ========================================
resource "railway_project" "noah" {
  name = var.project_name
}

# ========================================
# PostgreSQL Database Service
# ========================================
resource "railway_service" "postgres" {
  project_id = railway_project.noah.id
  name       = "PostgreSQL"
}

resource "railway_variable_collection" "postgres" {
  service_id     = railway_service.postgres.id
  environment_id = railway_project.noah.default_environment.id

  variables = [
    { name = "RAILWAY_DOCKER_IMAGE", value = "postgres:16-alpine" },
    { name = "POSTGRES_USER", value = "noah" },
    { name = "POSTGRES_PASSWORD", value = random_password.postgres.result },
    { name = "POSTGRES_DB", value = "noah" },
    { name = "PGDATA", value = "/var/lib/postgresql/data/pgdata" },
  ]
}

# ========================================
# Redis Cache Service
# ========================================
resource "railway_service" "redis" {
  project_id = railway_project.noah.id
  name       = "Redis"
}

resource "railway_variable_collection" "redis" {
  service_id     = railway_service.redis.id
  environment_id = railway_project.noah.default_environment.id

  variables = [
    { name = "RAILWAY_DOCKER_IMAGE", value = "redis:7-alpine" },
  ]
}

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
locals {
  postgres_internal_url = "postgresql://noah:${random_password.postgres.result}@PostgreSQL.railway.internal:5432/noah"
  redis_internal_url    = "redis://Redis.railway.internal:6379"
}

resource "railway_variable_collection" "server" {
  service_id     = railway_service.server.id
  environment_id = railway_project.noah.default_environment.id

  variables = [
    # Server binding
    { name = "PORT", value = "3000" },
    { name = "PRIVATE_PORT", value = "3099" },
    { name = "HOST", value = "0.0.0.0" },

    # Database connections (using Railway private networking)
    { name = "POSTGRES_URL", value = local.postgres_internal_url },
    { name = "REDIS_URL", value = local.redis_internal_url },

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
