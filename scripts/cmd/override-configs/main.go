package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"regexp"
)

//
// STRUCTS
//

// PackageMetadata defines the structure of the package-metadata.json file.
// It includes identifier, descriptive information, version, dependencies,
// environment variables, and override configurations for the package.
// - Id: A unique identifier for the package.
// - Name: The human-readable name of the package.
// - Description: A brief description of the package's purpose.
// - Type: The type of package (e.g., "platform", "implementation").
// - Version: The version number of the package.
// - Dependencies: A list of package IDs that this package depends on.
// - EnvironmentVariables: A map of environment variables required by the package.
// - Overrides: A list of file path patterns to be overridden from an implementation package.
type PackageMetadata struct {
	Id                   string
	Name                 string
	Description          string
	Type                 string
	Version              string
	Dependencies         []string
	EnvironmentVariables map[string]interface{}
	Overrides            []string
}

// PlatformPackage encapsulates a package's metadata along with the path
// to its package-metadata.json file.
// - Path: The file system path to the package-metadata.json file.
// - PackageMetadata: The parsed content of the package-metadata.json file.
type PlatformPackage struct {
	Path            string
	PackageMetadata PackageMetadata
}

//
// HELPERS
//

// handleError is a helper function to check for errors.
// If an error is present, it returns the error.
func handleError(e error) error {
	return e
}

// copy copies a file from srcFile to dstFile.
// It creates the destination file, overwriting it if it already exists.
func copy(srcFile, dstFile string) error {
	out, err := os.Create(dstFile)
	if err != nil {
		return err
	}

	defer out.Close()

	in, err := os.Open(srcFile)
	if err != nil {
		return err
	}
	defer in.Close()
	if err != nil {
		return err
	}

	_, err = io.Copy(out, in)
	if err != nil {
		return err
	}

	return nil
}

//
// MAIN
//

// getAllPackages scans the specified directory (`platformPath`) recursively
// to find all files named "package-metadata.json". It then parses each of these
// files into a PackageMetadata struct and returns a slice of PlatformPackage
// structs, each containing the path to the metadata file and its parsed content.
// If any error occurs during directory traversal or file processing, it returns an error.
func getAllPackages(platformPath string) ([]PlatformPackage, error) {
	var packages []PlatformPackage
	err := filepath.WalkDir(platformPath, func(p string, info os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("error walking directory at %s: %w", p, walkErr)
		}
		if filepath.Base(p) == "package-metadata.json" {
			packageMetadataBytes, err := ioutil.ReadFile(p)
			if err != nil {
				return fmt.Errorf("failed to read file %s: %w", p, err)
			}

			var packageMetadataJson PackageMetadata
			err = json.Unmarshal(packageMetadataBytes, &packageMetadataJson)
			if err != nil {
				return fmt.Errorf("failed to unmarshal package metadata from %s: %w", p, err)
			}
			packages = append(packages, PlatformPackage{Path: p, PackageMetadata: packageMetadataJson})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return packages, nil
}

// overridePackages processes a list of implementation packages and applies their overrides
// to the corresponding platform packages. For each implementation package, it iterates
// through its files. If a file path matches an override pattern specified in the
// implementation package's metadata (or if no overrides are specified, all files are
// considered for override), it copies that file to the corresponding location in the
// platform directory, effectively overriding the platform's version of the file.
// - platformDir: The root directory of the platform packages.
// - platformPackages: A slice of currently known platform packages (not directly used in current logic but available).
// - implementationPackages: A slice of implementation packages whose files will override those in the platform.
// It returns an error if any file operation (like creating directories or copying files) fails.
func overridePackages(platformDir string, platformPackages, implementationPackages []PlatformPackage) error {

	for _, implementationPackage := range implementationPackages {

		implementationPackagePath := filepath.Dir(implementationPackage.Path)
		packageFolderName := filepath.Base(implementationPackagePath)
		overridePackageRoot := filepath.Join(platformDir, packageFolderName)

		err := os.MkdirAll(overridePackageRoot, 0755)
		if err = handleError(err); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", overridePackageRoot, err)
		}

		var implementationPackageOverrides []string
		if implementationPackage.PackageMetadata.Overrides != nil {
			implementationPackageOverrides = implementationPackage.PackageMetadata.Overrides
		}

		filepath.WalkDir(implementationPackagePath, func(path string, info os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			relativePackageFilePath, err := filepath.Rel(implementationPackagePath, path)
			if err = handleError(err); err != nil {
				return fmt.Errorf("failed to get relative path for %s: %w", path, err)
			}

			if info.IsDir() {
				if relativePackageFilePath != "." {
					overrideDir := filepath.Join(overridePackageRoot, relativePackageFilePath)
					if _, err := os.Stat(overrideDir); os.IsNotExist(err) {
						err = os.Mkdir(overrideDir, 0755)
						if err = handleError(err); err != nil {
							return fmt.Errorf("failed to create directory %s: %w", overrideDir, err)
						}
					}
				}
			} else {
				shouldOverride := implementationPackageOverrides == nil

				for _, override := range implementationPackageOverrides {
					// We ignore regexp.MatchString error as a pattern error is a developer error
					match, _ := regexp.MatchString(override, relativePackageFilePath)
					if match {
						shouldOverride = true
						break
					}
				}
				if shouldOverride {
					err = copy(path, filepath.Join(overridePackageRoot, relativePackageFilePath))
					if err = handleError(err); err != nil {
						return fmt.Errorf("failed to copy file from %s to %s: %w", path, filepath.Join(overridePackageRoot, relativePackageFilePath), err)
					}
				}
			}

			return nil
		})
		if err != nil {
			return err // Propagate error from WalkDir
		}
	}
	return nil
}

// main is the entry point of the override-configs program.
// It performs the following steps:
// 1. Defines the paths for the platform (current directory) and implementation packages ("/implementation").
// 2. Calls getAllPackages to find and parse all package-metadata.json files for both platform and implementation.
//    If an error occurs during this stage, it prints the error to stderr and exits.
// 3. Calls overridePackages to copy files from implementation packages to the platform packages
//    based on the "Overrides" configuration in their respective package-metadata.json files.
//    If an error occurs during this stage, it prints the error to stderr and exits.
// 4. If all operations are successful, it prints a success message.
func main() {
	fmt.Println("Overriding configs...")
	platformPath := "./"
	implementationPath := "/implementation"

	platformPackages, err := getAllPackages(platformPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error getting platform packages: %v\n", err)
		os.Exit(1)
	}

	implementationPackages, err := getAllPackages(implementationPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error getting implementation packages: %v\n", err)
		os.Exit(1)
	}

	err = overridePackages(platformPath, platformPackages, implementationPackages)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error overriding packages: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Configs overridden successfully.")
}
