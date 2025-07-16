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

# Global flag to track if OpenFn adaptors have been built
OPENFN_ADAPTORS_BUILT=false

# Function to build custom OpenFn adaptors for local adaptors mode (Docker-only dependency)
build_custom_openfn_adaptors() {
    # Skip if already built in this session
    if [[ "$OPENFN_ADAPTORS_BUILT" == "true" ]]; then
        echo "✅ Custom OpenFn adaptors already built in this session"
        return 0
    fi
    
    echo "🔧 Building custom OpenFn adaptors for local adaptors mode..."
    
    # Build the adaptors using the Dockerfile.build with volume mount
    echo "🏗️  Building OpenFn adaptors using Dockerfile.build with volume mount..."
    cd "$PROJECT_ROOT/projects/openfn-custom-adaptors"
    
    # Build the Docker image with the build process
    docker build -f Dockerfile.build -t openfn-adaptors-builder .
    
    # Run the container with volume mount - build output will be created directly in host filesystem
    docker run --rm \
        -v "$(pwd):/workspace" \
        -w /workspace \
        openfn-adaptors-builder
    
    echo "✅ Custom OpenFn adaptors built successfully"
    echo "   📁 Built packages available in submodule location"
    echo "   🔧 OpenFn will use LOCAL_ADAPTORS=true to load from /app/openfn-adaptors"
    
    # Mark as built for this session
    OPENFN_ADAPTORS_BUILT=true
    return 0
}

# Function to build custom image for a project
build_custom_image() {
    local project_name="$1"
    local package_name="$2"
    
    echo "🔨 Checking build configuration for project: $project_name"
    
    # Determine project directory
    local project_dir="$PROJECT_ROOT/projects/$project_name"
    
    # Special case handling for projects that don't have their own directory
    case "$project_name" in
        "openfn-cli-test")
            project_dir="$PROJECT_ROOT/projects/openfn-workflows"
            ;;
        "openfn-worker")
            project_dir="$PROJECT_ROOT/projects/openfn"
            ;;
    esac
    
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
    elif [[ "$project_name" == "openfn-worker" ]]; then
        dockerfile_path="$project_dir/Dockerfile.worker"
        dockerfile_arg="-f Dockerfile.worker"
        if [[ ! -f "$dockerfile_path" ]]; then
            echo "❌ Dockerfile.worker not found in: $dockerfile_path"
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
        # Build custom SFTP adaptor first
        build_custom_openfn_adaptors || {
            echo "❌ Failed to build custom OpenFn adaptors"
            return 1
        }
        
        cd "$PROJECT_ROOT/projects"
        docker build \
            -f "openfn/Dockerfile" \
            --build-arg "${project_name^^}_BASE_IMAGE=$base_image" \
            -t "$local_image_tag" \
            .
    # Special handling for openfn-worker that needs access to openfn-adaptors
    elif [[ "$project_name" == "openfn-worker" ]]; then
        # Build custom SFTP adaptor first
        build_custom_openfn_adaptors || {
            echo "❌ Failed to build custom OpenFn adaptors"
            return 1
        }
        
        cd "$PROJECT_ROOT/projects"
        docker build \
            -f "openfn/Dockerfile.worker" \
            --build-arg "${project_name^^}_BASE_IMAGE=$base_image" \
            -t "$local_image_tag" \
            .
    # Special handling for openfn-cli-test that uses a different Dockerfile
    elif [[ "$project_name" == "openfn-cli-test" ]]; then
        # Build custom SFTP adaptor first for CLI testing
        build_custom_openfn_adaptors || {
            echo "❌ Failed to build custom OpenFn adaptors"
            return 1
        }
        
        cd "$PROJECT_ROOT/projects"
        docker build \
            -f "openfn-workflows/Dockerfile.cli" \
            --build-arg "OPENFN_CLI_TEST_IMAGE=$base_image" \
            -t "$local_image_tag" \
            .
    # Special handling for openfn-workflows that has dependency issues with docker/Dockerfile
    elif [[ "$project_name" == "openfn-workflows" ]]; then
        # Try the docker/Dockerfile first, but if it fails due to missing openfn-adaptors, create a simple fallback
        if [[ -f "$project_dir/docker/Dockerfile" ]]; then
            echo "🔄 Attempting to build with docker/Dockerfile..."
            if ! docker build -f docker/Dockerfile --build-arg "${project_name^^}_BASE_IMAGE=$base_image" -t "$local_image_tag" . 2>/dev/null; then
                echo "⚠️  docker/Dockerfile failed (likely missing openfn-adaptors), creating fallback Dockerfile..."
                # Create a simple fallback Dockerfile
                cat > Dockerfile.fallback << 'EOF'
FROM node:18-alpine
RUN npm install -g @openfn/cli@latest
WORKDIR /app
COPY . .
CMD ["tail", "-f", "/dev/null"]
EOF
                docker build -f Dockerfile.fallback --build-arg "${project_name^^}_BASE_IMAGE=$base_image" -t "$local_image_tag" .
                rm Dockerfile.fallback  # Clean up the temporary Dockerfile
            fi
        else
            # No docker/Dockerfile, create simple one
            echo "📦 Creating simple Dockerfile for openfn-workflows..."
            cat > Dockerfile.fallback << 'EOF'
FROM node:18-alpine
RUN npm install -g @openfn/cli@latest
WORKDIR /app
COPY . .
CMD ["tail", "-f", "/dev/null"]
EOF
            docker build -f Dockerfile.fallback --build-arg "${project_name^^}_BASE_IMAGE=$base_image" -t "$local_image_tag" .
            rm Dockerfile.fallback  # Clean up the temporary Dockerfile
        fi
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
            
            # Handle openfn-workflows specially - it's needed for workflow loading
            if [[ "$project_name" == "openfn-workflows" ]]; then
                build_custom_image "$project_name" "openfn"
                continue
            fi
            
            # Map project name to package name for specific known projects
            case "$project_name" in
                "dhis2")
                    build_custom_image "$project_name" "dhis2-instance"
                    ;;
                "sftp")
                    build_custom_image "$project_name" "sftp-storage"
                    ;;
                "openfn")
                    build_custom_image "$project_name" "openfn"
                    ;;
                *)
                    build_custom_image "$project_name" ""
                    ;;
            esac
        fi
    done
    
    # Also build special projects that don't have their own directories
    build_custom_image "openfn-worker" "openfn"
    build_custom_image "openfn-cli-test" "openfn"
else
    # Build specific projects
    for project_name in "$@"; do
        # Map project name to package name for specific known projects
        case "$project_name" in
            "dhis2")
                build_custom_image "$project_name" "dhis2-instance"
                ;;
            "sftp")
                build_custom_image "$project_name" "sftp-storage"
                ;;
            "openfn"|"openfn-worker"|"openfn-cli-test"|"openfn-workflows")
                build_custom_image "$project_name" "openfn"
                ;;
            *)
                build_custom_image "$project_name" ""
                ;;
        esac
    done
fi

echo "🎉 Custom image build process completed!"