variable "railway_token" {
  description = "Railway API token - get from https://railway.app/account/tokens"
  type        = string
  sensitive   = true
}

variable "postgres_password" {
  description = "Password for the PostgreSQL database"
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Name of the Railway project"
  type        = string
  default     = "noah-server"
}

variable "github_repo" {
  description = "GitHub repository (e.g., 'username/noah')"
  type        = string
}

variable "github_branch" {
  description = "GitHub branch to deploy"
  type        = string
  default     = "main"
}

variable "server_network" {
  description = "Bitcoin network: bitcoin, signet, or regtest"
  type        = string
  default     = "regtest"

  validation {
    condition     = contains(["bitcoin", "signet", "regtest"], var.server_network)
    error_message = "server_network must be one of: bitcoin, signet, regtest"
  }
}

variable "lnurl_domain" {
  description = "LNURL domain for Lightning Address"
  type        = string
}

variable "ark_server_url" {
  description = "Ark server URL for layer-2 connections"
  type        = string
}

variable "expo_access_token" {
  description = "Expo push notification access token"
  type        = string
  sensitive   = true
}

variable "s3_bucket_name" {
  description = "S3 bucket name for backups"
  type        = string
}

variable "aws_access_key_id" {
  description = "AWS access key ID for S3"
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_secret_access_key" {
  description = "AWS secret access key for S3"
  type        = string
  sensitive   = true
  default     = ""
}

variable "aws_region" {
  description = "AWS region for S3"
  type        = string
  default     = "us-east-2"
}

variable "minimum_app_version" {
  description = "Minimum app version required for clients"
  type        = string
  default     = "0.0.1"
}

variable "sentry_url" {
  description = "Sentry DSN URL for error tracking (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "ntfy_auth_token" {
  description = "Ntfy auth token for notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "custom_domain" {
  description = "Custom domain for the server (optional)"
  type        = string
  default     = ""
}
