const { spawnSync } = require('child_process');
const os = require('os');

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

function build() {
    const target = getBuildTarget();
    console.log(`Building for target: ${target}`);

    // Clean previous builds
    spawnSync('npm', ['run', 'clean'], { stdio: 'inherit' });

    // Set CARGO_BUILD_TARGET and run the build
    const env = { ...process.env, CARGO_BUILD_TARGET: target };
    const buildResult = spawnSync('napi', ['build', '--platform', '--release'], { env, stdio: 'inherit' });
    
    if (buildResult.status !== 0) {
        console.error('Build failed');
        process.exit(1);
    }

    // Build TypeScript
    const tsBuildResult = spawnSync('npm', ['run', 'build:ts'], { stdio: 'inherit' });
    
    if (tsBuildResult.status !== 0) {
        console.error('TypeScript build failed');
        process.exit(1);
    }

    // Create symlink to the correct native module
    const nativeModuleName = `tycho-simulation-ts.${target}.node`;
    const symlinkCommand = process.platform === 'win32' ? 
        ['cmd', ['/c', `mklink index.node ${nativeModuleName}`]] :
        ['ln', ['-sf', nativeModuleName, 'index.node']];

    const symlinkResult = spawnSync(symlinkCommand[0], symlinkCommand[1], { stdio: 'inherit' });
    
    if (symlinkResult.status !== 0) {
        console.error('Failed to create symlink');
        process.exit(1);
    }

    console.log('Build completed successfully');
}

build(); 