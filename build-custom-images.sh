#!/bin/bash
set -e

# Build custom Docker images for packages
# This script builds custom images based on projects/ folder structure
# and uses base image versions from package metadata or environment variables

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to get environment variable value with fallback priority:
# 1. Environment variable
# 2. Root-level .env file
# 3. Package metadata file
get_env_value() {
    local var_name="$1"
    local package_name="$2"
    
    # Check environment variable first
    if [[ -n "${!var_name}" ]]; then
        echo "${!var_name}"
        return
    fi
    
    # Check root-level .env file
    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        local env_value=$(grep "^${var_name}=" "$PROJECT_ROOT/.env" 2>/dev/null | cut -d'=' -f2- | sed 's/^["'\'']//' | sed 's/["'\'']$//')
        if [[ -n "$env_value" ]]; then
            echo "$env_value"
            return
        fi
    fi
    
    # Check package metadata file
    if [[ -n "$package_name" ]]; then
        local metadata_file="$PROJECT_ROOT/packages/$package_name/package-metadata.json"
        if [[ -f "$metadata_file" ]]; then
            local metadata_value=$(jq -r ".environmentVariables.${var_name} // empty" "$metadata_file" 2>/dev/null)
            if [[ -n "$metadata_value" && "$metadata_value" != "null" ]]; then
                echo "$metadata_value"
                return
            fi
        fi
    fi
    
    echo ""
}

# Function to build custom image for a project
build_custom_image() {
    local project_name="$1"
    local package_name="$2"
    
    echo "🔨 Checking build configuration for project: $project_name"
    
    local project_dir="$PROJECT_ROOT/projects/$project_name"
    if [[ ! -d "$project_dir" ]]; then
        echo "❌ Project directory not found: $project_dir"
        return 1
    fi
    
    local dockerfile_path="$project_dir/Dockerfile"
    if [[ ! -f "$dockerfile_path" ]]; then
        echo "❌ Dockerfile not found: $dockerfile_path"
        return 1
    fi
    
    # Get base image from environment/package metadata
    local base_image_var="${project_name^^}_IMAGE"
    base_image_var="${base_image_var//-/_}" # Replace hyphens with underscores
    local base_image=$(get_env_value "$base_image_var" "$package_name")
    
    # Get local image tag from environment/package metadata
    local local_image_var="LOCAL_${project_name^^}_IMAGE"
    local_image_var="${local_image_var//-/_}" # Replace hyphens with underscores
    local local_image_tag=$(get_env_value "$local_image_var" "$package_name")
    
    if [[ -z "$base_image" ]]; then
        echo "❌ Could not determine base image for $project_name"
        echo "   Looked for variable: $base_image_var"
        echo "   In package: $package_name"
        return 1
    fi
    
    if [[ -z "$local_image_tag" ]]; then
        echo "⏭️  Skipping build for $project_name - LOCAL_${project_name^^}_IMAGE not set or empty"
        echo "   To enable building, set LOCAL_${project_name^^}_IMAGE in package metadata"
        return 0
    fi
    
    echo "📦 Using base image: $base_image"
    echo "🏷️  Will tag as: $local_image_tag"
    
    # Build the custom image
    echo "🏗️  Building custom image: $local_image_tag"
    
    cd "$project_dir"
    docker build \
        --build-arg "${project_name^^}_BASE_IMAGE=$base_image" \
        -t "$local_image_tag" \
        .
    
    if [[ $? -eq 0 ]]; then
        echo "✅ Successfully built custom image: $local_image_tag"
        echo "   Base image: $base_image"
        echo ""
        echo "The custom image is ready to use. Your package metadata already specifies:"
        echo "   \"${local_image_var}\": \"$local_image_tag\""
        echo ""
    else
        echo "❌ Failed to build custom image for $project_name"
        return 1
    fi
}

# Main execution
echo "🚀 Building custom Docker images..."
echo "Project root: $PROJECT_ROOT"
echo ""

# Check if jq is available for JSON parsing
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Please install jq to continue."
    exit 1
fi

# Build custom images for each project
if [[ $# -eq 0 ]]; then
    # Build all projects if no arguments provided
    echo "🔍 Scanning for projects to build..."
    
    for project_dir in "$PROJECT_ROOT/projects"/*; do
        if [[ -d "$project_dir" && -f "$project_dir/Dockerfile" ]]; then
            project_name=$(basename "$project_dir")
            
            # Try to map project to package name
            case "$project_name" in
                "dhis2")
                    build_custom_image "$project_name" "dhis2-instance"
                    ;;
                *)
                    build_custom_image "$project_name" ""
                    ;;
            esac
        fi
    done
else
    # Build specific projects
    for project_name in "$@"; do
        case "$project_name" in
            "dhis2")
                build_custom_image "$project_name" "dhis2-instance"
                ;;
            *)
                build_custom_image "$project_name" ""
                ;;
        esac
    done
fi

echo "🎉 Custom image build process completed!"