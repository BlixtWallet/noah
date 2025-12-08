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

output "server_domain" {
  description = "Railway-generated domain for the server"
  value       = railway_service_domain.server.domain
}

output "cname_target" {
  description = "CNAME target for custom domain - point your Cloudflare DNS here"
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
