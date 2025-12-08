output "project_id" {
  description = "Railway project ID"
  value       = railway_project.noah.id
}

output "project_name" {
  description = "Railway project name"
  value       = railway_project.noah.name
}

output "server_service_id" {
  description = "Noah server service ID"
  value       = railway_service.server.id
}

output "postgres_service_id" {
  description = "PostgreSQL service ID"
  value       = railway_service.postgres.id
}

output "redis_service_id" {
  description = "Redis service ID"
  value       = railway_service.redis.id
}

output "server_domain" {
  description = "Railway-generated domain for the server"
  value       = railway_service_domain.server.domain
}

output "custom_domain" {
  description = "Custom domain if configured"
  value       = var.custom_domain != "" ? railway_custom_domain.server[0].domain : null
}

output "railway_dashboard_url" {
  description = "URL to the Railway project dashboard"
  value       = "https://railway.app/project/${railway_project.noah.id}"
}
