import { spawnSync } from 'child_process';
import { existsSync, copyFileSync, unlinkSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

function getBuildTarget() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'darwin') {
        // macOS
        if (arch === 'arm64') {
            return 'aarch64-apple-darwin';
        } else if (arch === 'x64') {
            return 'x86_64-apple-darwin';
        }
    } else if (platform === 'linux') {
        // Linux
        if (arch === 'arm64') {
            return 'aarch64-unknown-linux-gnu';
        } else if (arch === 'x64') {
            return 'x86_64-unknown-linux-gnu';
        }
    } else if (platform === 'win32' && arch === 'x64') {
        // Windows
        return 'x86_64-pc-windows-msvc';
    }

    throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function findNativeModule(target) {
    // Map platform-specific names
    const platformMap = {
        'aarch64-apple-darwin': 'darwin-arm64',
        'x86_64-apple-darwin': 'darwin-x64',
        'x86_64-pc-windows-msvc': 'win32-x64',
        'aarch64-unknown-linux-gnu': 'linux-arm64',
        'x86_64-unknown-linux-gnu': 'linux-x64'
    };

    const possibleNames = [
        `tycho-simulation-ts.${target}.node`,
        `tycho-simulation-ts.${platformMap[target]}.node`,
        'index.node',
        'tycho-simulation-ts.node'
    ];

    // List all .node files in root directory
    const nodeFiles = readdirSync(rootDir).filter(file => file.endsWith('.node'));
    console.log('Found .node files:', nodeFiles);

    for (const name of possibleNames) {
        const path = resolve(rootDir, name);
        if (existsSync(path)) {
            console.log(`Found native module at ${path}`);
            return path;
        }
    }

    console.log('No native module found with names:', possibleNames);
    return null;
}

function copyNativeModule(target) {
    const sourcePath = findNativeModule(target);
    if (!sourcePath) {
        console.log('No existing native module found');
        return false;
    }

    const destPath = resolve(rootDir, 'index.node');

    // Remove existing file if it exists
    try {
        if (existsSync(destPath) && destPath !== sourcePath) {
            unlinkSync(destPath);
        }
    } catch (error) {
        console.warn('Failed to remove existing file:', error);
    }

    // Copy the file if source and destination are different
    if (sourcePath !== destPath) {
        try {
            copyFileSync(sourcePath, destPath);
            console.log(`Copied native module: ${sourcePath} -> ${destPath}`);
        } catch (error) {
            console.error('Failed to copy native module:', error);
            return false;
        }
    } else {
        console.log('Native module already in place');
    }

    return true;
}

function buildNative(target) {
    console.log('Building native module...');
    
    // Clean any existing artifacts first
    const cleanResult = spawnSync('npm', ['run', 'clean'], { stdio: 'inherit' });
    if (cleanResult.status !== 0) {
        console.error('Clean failed');
        throw new Error('Failed to clean before build');
    }

    // Set CARGO_BUILD_TARGET and run the build
    const env = { ...process.env, CARGO_BUILD_TARGET: target };
    console.log(`Building for target: ${target}`);
    
    const buildResult = spawnSync('napi', ['build', '--platform', '--release'], { 
        env, 
        stdio: 'inherit',
        shell: true
    });
    
    if (buildResult.status !== 0) {
        console.error('Native build failed');
        if (buildResult.error) {
            console.error('Build error:', buildResult.error);
        }
        throw new Error('Native build failed');
    }

    console.log('Native build completed');
    
    // List files after build
    const files = readdirSync(rootDir);
    console.log('Files after build:', files);
}

function buildTypeScript() {
    console.log('Building TypeScript...');
    const tsBuildResult = spawnSync('npm', ['run', 'build:ts'], { 
        stdio: 'inherit',
        shell: true
    });
    
    if (tsBuildResult.status !== 0) {
        throw new Error('TypeScript build failed');
    }

    console.log('TypeScript build completed');
}

function build() {
    const target = getBuildTarget();
    console.log(`Building for target: ${target}`);

    const isPostInstall = process.env.npm_lifecycle_event === 'postinstall';
    const hasNativeModule = copyNativeModule(target);

    if (!hasNativeModule) {
        console.log('No native module found, building from source...');
        buildNative(target);
        
        // Try copying again after build
        if (!copyNativeModule(target)) {
            console.error('Native module not found after build');
            console.log('Current directory contents:', readdirSync(rootDir));
            throw new Error('Failed to copy native module after build');
        }
    }

    // Only build TypeScript during development, not during installation
    // if (!isPostInstall) {
    //     buildTypeScript();
    // }

    console.log('Build completed successfully');
}

build(); 