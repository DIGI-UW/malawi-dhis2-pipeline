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
    
    # Special handling for openfn-cli-test which doesn't have its own project directory
    if [[ "$project_name" == "openfn-cli-test" ]]; then
        local project_dir="$PROJECT_ROOT/projects/openfn-workflows"
    else
    local project_dir="$PROJECT_ROOT/projects/$project_name"
    fi
    
    if [[ ! -d "$project_dir" ]]; then
        echo "❌ Project directory not found: $project_dir"
        return 1
    fi
    
    # Check for Dockerfile in root or docker/ subdirectory
    local dockerfile_path="$project_dir/Dockerfile"
    local dockerfile_arg=""
    
    # Special handling for openfn-cli-test which uses Dockerfile.cli
    if [[ "$project_name" == "openfn-cli-test" ]]; then
        dockerfile_path="$project_dir/Dockerfile.cli"
        dockerfile_arg="-f Dockerfile.cli"
        if [[ ! -f "$dockerfile_path" ]]; then
            echo "❌ Dockerfile.cli not found in: $dockerfile_path"
            return 1
        fi
    elif [[ -f "$dockerfile_path" ]]; then
        dockerfile_arg=""  # Use default Dockerfile location
    elif [[ -f "$project_dir/docker/Dockerfile" ]]; then
        dockerfile_path="$project_dir/docker/Dockerfile"
        dockerfile_arg="-f docker/Dockerfile"
    else
        echo "❌ Dockerfile not found in: $project_dir/Dockerfile or $project_dir/docker/Dockerfile"
        return 1
    fi
    
    # Get base image from environment/package metadata
    local base_image_var="${project_name^^}_IMAGE"
    base_image_var="${base_image_var//-/_}" # Replace hyphens with underscores
    local base_image=$(get_env_value "$base_image_var" "$package_name")
    
    # For all projects, check for LOCAL_ prefixed variable
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
    echo "📄 Using Dockerfile: $dockerfile_path"
    
    cd "$project_dir"
    
    # Special handling for openfn project that needs access to openfn-adaptors
    if [[ "$project_name" == "openfn" ]]; then
        cd "$PROJECT_ROOT/projects"
        docker build \
            -f "openfn/Dockerfile" \
            --build-arg "${project_name^^}_BASE_IMAGE=$base_image" \
            -t "$local_image_tag" \
            .
    # Special handling for openfn-cli-test that uses a different Dockerfile
    elif [[ "$project_name" == "openfn-cli-test" ]]; then
        cd "$PROJECT_ROOT/projects"
        docker build \
            -f "openfn-workflows/Dockerfile.cli" \
            --build-arg "OPENFN_CLI_TEST_IMAGE=$base_image" \
            -t "$local_image_tag" \
            .
    else
    docker build \
        $dockerfile_arg \
        --build-arg "${project_name^^}_BASE_IMAGE=$base_image" \
        -t "$local_image_tag" \
        .
    fi
    
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
if [[ $# -eq 0 ]] || [[ "$1" == "all" ]]; then
    # Build all projects if no arguments provided or "all" is specified
    echo "🔍 Scanning for projects to build..."
    
    for project_dir in "$PROJECT_ROOT/projects"/*; do
        if [[ -d "$project_dir" && ( -f "$project_dir/Dockerfile" || -f "$project_dir/docker/Dockerfile" ) ]]; then
            project_name=$(basename "$project_dir")
            
            # Skip openfn-workflows as it's used for CLI testing only, not as a deployable service
            if [[ "$project_name" == "openfn-workflows" ]]; then
                echo "⏭️  Skipping openfn-workflows - used for CLI testing only"
                continue
            fi
            
            # Map project name to package name for specific known projects,
            # otherwise, attempt to build with an empty package name.
            case "$project_name" in
                # The "dhis2" project corresponds to the "dhis2-instance" package.
                "dhis2")
                    build_custom_image "$project_name" "dhis2-instance"
                    ;;
                # The "sftp" project corresponds to the "sftp-storage" package.
                "sftp")
                    build_custom_image "$project_name" "sftp-storage"
                    ;;
                # The "openfn" project corresponds to the "openfn" package.
                "openfn")
                    build_custom_image "$project_name" "openfn"
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
        # Map project name to package name for specific known projects,
        # otherwise, attempt to build with an empty package name.
        case "$project_name" in
            "dhis2")
                build_custom_image "$project_name" "dhis2-instance"
                ;;
            "sftp")
                build_custom_image "$project_name" "sftp-storage"
                ;;
            # The "openfn" project corresponds to the "openfn" package.
            "openfn")
                build_custom_image "$project_name" "openfn"
                ;;
            # The "openfn-cli-test" builds CLI test container from workflows directory
            "openfn-cli-test")
                build_custom_image "$project_name" "openfn"
                ;;
            *)
                build_custom_image "$project_name" ""
                ;;
        esac
    done
fi

echo "🎉 Custom image build process completed!"