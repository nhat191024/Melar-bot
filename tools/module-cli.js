#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, 'src', 'modules');
const CONFIG_PATH = path.join(ROOT, 'config', 'modules.json');
const ENV_PATH = path.join(ROOT, '.env');

// ─── Helpers ────────────────────────────────────────────────────────────────

function readConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return { modules: {}, settings: { autoLoadNewModules: true, enabledByDefault: true, allowRuntimeToggle: true } };
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function readEnv() {
    if (!fs.existsSync(ENV_PATH)) return {};
    const result = {};
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        result[key.trim()] = rest.join('=').trim();
    }
    return result;
}

function writeEnv(vars) {
    if (!fs.existsSync(ENV_PATH)) return;
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const [key, value] of Object.entries(vars)) {
        const idx = lines.findIndex(l => l.trim().startsWith(`${key}=`));
        if (idx !== -1) {
            lines[idx] = `${key}=${value}`;
        } else {
            // Insert after the last MODULE_ line, or append
            const lastModule = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.startsWith('MODULE_')).pop();
            if (lastModule) {
                lines.splice(lastModule.i + 1, 0, `${key}=${value}`);
            } else {
                lines.push(`${key}=${value}`);
            }
        }
    }
    fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

/**
 * Scan src/modules/ and return real info for each module directory.
 * Merges filesystem data with config.json data.
 */
function discoverModules() {
    const config = readConfig();
    const env = readEnv();
    const results = [];

    if (!fs.existsSync(MODULES_DIR)) return results;

    const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        const modulePath = path.join(MODULES_DIR, name);
        const indexPath = path.join(modulePath, 'index.js');
        const commandsPath = path.join(modulePath, 'commands');
        const dataPath = path.join(modulePath, 'data');

        // Read meta from index.js (static parse — no require)
        let version = '?', description = null;
        if (fs.existsSync(indexPath)) {
            const src = fs.readFileSync(indexPath, 'utf8');
            const verMatch = src.match(/this\.version\s*=\s*['"`]([^'"`]+)['"`]/);
            const descMatch = src.match(/this\.description\s*=\s*['"`]([^'"`]+)['"`]/);
            if (verMatch) version = verMatch[1];
            if (descMatch) description = descMatch[1];
        }

        // Count commands (recursive)
        const commandCount = fs.existsSync(commandsPath)
            ? countJsFiles(commandsPath)
            : 0;

        // Determine enabled state — env takes priority over config
        const envKey = `MODULE_${name.toUpperCase()}`;
        const configData = config.modules[name] || {};
        let enabled;
        if (env[envKey] !== undefined) {
            enabled = env[envKey] !== 'false';
        } else if (configData.hasOwnProperty('enabled')) {
            enabled = configData.enabled;
        } else {
            enabled = config.settings?.enabledByDefault !== false;
        }

        results.push({
            name,
            version,
            description: description || configData.description || '—',
            category: configData.category || 'Uncategorized',
            dependencies: configData.dependencies || [],
            commandCount,
            hasIndex: fs.existsSync(indexPath),
            hasData: fs.existsSync(dataPath),
            enabled,
            inConfig: !!config.modules[name],
            envKey,
            envControlled: env[envKey] !== undefined,
        });
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
}

function countJsFiles(dir) {
    let count = 0;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            count += countJsFiles(full);
        } else if (item.name.endsWith('.js')) {
            count++;
        }
    }
    return count;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

class ModuleCLI {
    constructor() {
        this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }

    question(prompt) {
        return new Promise(resolve => this.rl.question(prompt, resolve));
    }

    async run() {
        console.log('\n🔧  Discord Bot — Module Manager CLI');
        console.log('=====================================');

        try {
            while (true) {
                console.log('\n🔧  Chọn hành động:');
                console.log('  1. Liệt kê modules');
                console.log('  2. Bật / Tắt module');
                console.log('  3. Tạo module mới (scaffold)');
                console.log('  4. Đồng bộ config với filesystem');
                console.log('  5. Chi tiết module');
                console.log('  6. Thoát');

                const choice = await this.question('\n> Nhập lựa chọn (1-6): ');

                switch (choice.trim()) {
                    case '1': this.listModules(); break;
                    case '2': await this.toggleModule(); break;
                    case '3': await this.scaffoldModule(); break;
                    case '4': await this.syncConfig(); break;
                    case '5': await this.moduleDetail(); break;
                    case '6':
                        console.log('\n👋 Tạm biệt!\n');
                        this.rl.close();
                        return;
                    default:
                        console.log('❌ Lựa chọn không hợp lệ.');
                }
            }
        } catch (error) {
            console.error('\n❌ Lỗi:', error.message);
            this.rl.close();
        }
    }

    // ── 1. List ──────────────────────────────────────────────────────────────

    listModules() {
        const modules = discoverModules();

        if (modules.length === 0) {
            console.log('\n⚠️  Không tìm thấy module nào trong src/modules/');
            return;
        }

        // Group by category
        const groups = {};
        for (const m of modules) {
            (groups[m.category] = groups[m.category] || []).push(m);
        }

        console.log(`\n📋 Modules (${modules.length} tổng, ${modules.filter(m => m.enabled).length} đang bật):`);

        for (const [cat, list] of Object.entries(groups)) {
            console.log(`\n  📂 ${cat}`);
            for (const m of list) {
                const status = m.enabled ? '✅' : '❌';
                const src = m.envControlled ? '[env]' : '[config]';
                const warn = m.hasIndex ? '' : ' ⚠️  no index.js';
                const sync = m.inConfig ? '' : ' 📌 not in config';
                console.log(`     ${status} ${m.name.padEnd(18)} v${m.version}  ${m.commandCount} cmd  ${src}${warn}${sync}`);
            }
        }
        console.log('');
    }

    // ── 2. Toggle ────────────────────────────────────────────────────────────

    async toggleModule() {
        const modules = discoverModules();
        if (modules.length === 0) { console.log('\n❌ Không tìm thấy module nào.'); return; }

        console.log('\nModules:');
        modules.forEach((m, i) => {
            const status = m.enabled ? '✅' : '❌';
            console.log(`  ${String(i + 1).padStart(2)}. ${status} ${m.name}`);
        });

        const input = await this.question('\n> Tên hoặc số thứ tự module: ');
        const target = isNaN(input)
            ? modules.find(m => m.name === input.trim())
            : modules[parseInt(input) - 1];

        if (!target) { console.log('❌ Không tìm thấy module.'); return; }

        const newState = !target.enabled;
        const stateText = newState ? 'BẬT' : 'TẮT';

        console.log(`\nModule: ${target.name}  →  ${stateText}`);
        console.log('Cập nhật ở đâu?');
        console.log('  1. config/modules.json  (khuyến nghị)');
        console.log('  2. .env file');
        console.log('  3. Cả hai');

        const where = await this.question('> Chọn (1-3): ');

        if (where === '1' || where === '3') {
            const config = readConfig();
            if (!config.modules[target.name]) config.modules[target.name] = {};
            config.modules[target.name].enabled = newState;
            writeConfig(config);
            console.log('  💾 Đã cập nhật config/modules.json');
        }

        if (where === '2' || where === '3') {
            writeEnv({ [target.envKey]: String(newState) });
            console.log(`  💾 Đã cập nhật .env (${target.envKey}=${newState})`);
        }

        console.log(`✅ Module '${target.name}' → ${stateText}`);
    }

    // ── 3. Scaffold ──────────────────────────────────────────────────────────

    async scaffoldModule() {
        console.log('\n🏗️  Tạo module mới\n');

        const name = (await this.question('Tên module (camelCase, ví dụ: myFeature): ')).trim();
        if (!name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
            console.log('❌ Tên không hợp lệ. Dùng chữ cái và số, bắt đầu bằng chữ cái.');
            return;
        }

        const targetPath = path.join(MODULES_DIR, name);
        if (fs.existsSync(targetPath)) {
            console.log(`❌ Thư mục src/modules/${name}/ đã tồn tại.`);
            return;
        }

        const description = (await this.question('Mô tả module: ')).trim() || 'Module description';
        const category = (await this.question('Danh mục (ví dụ: Utility, Fun, Automation): ')).trim() || 'Utility';
        const version = (await this.question('Phiên bản [1.0.0]: ')).trim() || '1.0.0';

        const confirm = await this.question(`\nTạo src/modules/${name}/? (y/n): `);
        if (confirm.toLowerCase() !== 'y') { console.log('Hủy.'); return; }

        // Create directories
        fs.mkdirSync(path.join(targetPath, 'commands'), { recursive: true });

        // Write index.js
        const indexContent = `const Logger = require('../../utils/Logger');

class ${capitalize(name)}Module {
    constructor(client) {
        this.client = client;
        this.name = '${name}';
        this.description = '${description}';
        this.version = '${version}';
        this.enabled = true;

        // TODO: add module state here
    }

    async load() {
        Logger.loading(\`Loading \${this.name} v\${this.version}...\`);
        // TODO: initialize resources
        Logger.success(\`\${this.name} loaded\`);
    }

    async unload() {
        // TODO: clean up resources
        Logger.info(\`\${this.name} unloaded\`);
    }

    getModuleInfo() {
        return {
            name: this.name,
            description: this.description,
            version: this.version,
            enabled: this.enabled,
        };
    }

    healthCheck() {
        return { healthy: true, issues: [] };
    }

    // [Optional] Register HTTP API routes
    // registerApiRoutes(moduleManager) { }
}

module.exports = ${capitalize(name)}Module;
`;
        fs.writeFileSync(path.join(targetPath, 'index.js'), indexContent);

        // Write example command
        const cmdContent = `const BaseCommand = require('../../../utils/BaseCommand');

class ${capitalize(name)}Command extends BaseCommand {
    constructor() {
        super({
            name: '${name.toLowerCase()}',
            description: '${description}',
            category: '${category.toLowerCase()}',
            module: '${name}',
            cooldown: 5,
        });
    }

    async execute(interaction) {
        const module = interaction.client.moduleManager.getModule('${name}');
        if (!module) {
            return interaction.reply({ content: '❌ Module chưa được tải.', ephemeral: true });
        }

        await interaction.reply({ content: '✅ ${name} command works!' });
    }
}

module.exports = ${capitalize(name)}Command;
`;
        fs.writeFileSync(path.join(targetPath, 'commands', `${name}.js`), cmdContent);

        // Update config/modules.json
        const config = readConfig();
        config.modules[name] = { enabled: true, description, category, dependencies: [] };
        writeConfig(config);

        console.log(`\n✅ Module '${name}' đã được tạo:`);
        console.log(`   📁 src/modules/${name}/`);
        console.log(`   📄 src/modules/${name}/index.js`);
        console.log(`   📄 src/modules/${name}/commands/${name}.js`);
        console.log(`   💾 config/modules.json đã cập nhật`);
        console.log(`\n💡 Thêm vào .env: MODULE_${name.toUpperCase()}=true`);
    }

    // ── 4. Sync config ───────────────────────────────────────────────────────

    async syncConfig() {
        const modules = discoverModules();
        const config = readConfig();

        const onDisk = modules.map(m => m.name);
        const inConfig = Object.keys(config.modules);

        const missing = onDisk.filter(n => !inConfig.includes(n));
        const orphaned = inConfig.filter(n => !onDisk.includes(n));

        if (missing.length === 0 && orphaned.length === 0) {
            console.log('\n✅ Config đã đồng bộ với filesystem — không có gì thay đổi.');
            return;
        }

        console.log('\n🔍 Kết quả phân tích:');
        if (missing.length > 0) {
            console.log(`\n  📌 Có trên disk nhưng CHƯA có trong config (${missing.length}):`);
            missing.forEach(n => console.log(`     + ${n}`));
        }
        if (orphaned.length > 0) {
            console.log(`\n  🗑️  Có trong config nhưng KHÔNG CÒN trên disk (${orphaned.length}):`);
            orphaned.forEach(n => console.log(`     - ${n}`));
        }

        const confirm = await this.question('\nĐồng bộ ngay? (y/n): ');
        if (confirm.toLowerCase() !== 'y') { console.log('Hủy.'); return; }

        for (const name of missing) {
            config.modules[name] = {
                enabled: config.settings?.enabledByDefault !== false,
                description: modules.find(m => m.name === name)?.description || '—',
                category: 'Uncategorized',
                dependencies: []
            };
            console.log(`  ✅ Thêm '${name}' vào config`);
        }

        for (const name of orphaned) {
            const keep = await this.question(`  Xóa '${name}' khỏi config? (y/n): `);
            if (keep.toLowerCase() === 'y') {
                delete config.modules[name];
                console.log(`  🗑️  Đã xóa '${name}' khỏi config`);
            }
        }

        writeConfig(config);
        console.log('\n💾 config/modules.json đã được cập nhật.');
    }

    // ── 5. Detail ────────────────────────────────────────────────────────────

    async moduleDetail() {
        const modules = discoverModules();
        const input = (await this.question('\nTên module: ')).trim();
        const target = modules.find(m => m.name === input);

        if (!target) { console.log('❌ Không tìm thấy module trên disk.'); return; }

        const commandsPath = path.join(MODULES_DIR, target.name, 'commands');
        const allCmds = fs.existsSync(commandsPath) ? listJsFiles(commandsPath, commandsPath) : [];

        console.log(`\n── ${target.name} ──────────────────────────────`);
        console.log(`  Mô tả:      ${target.description}`);
        console.log(`  Danh mục:   ${target.category}`);
        console.log(`  Phiên bản:  v${target.version}`);
        console.log(`  Trạng thái: ${target.enabled ? '✅ Bật' : '❌ Tắt'} (nguồn: ${target.envControlled ? `.env ${target.envKey}` : 'config/modules.json'})`);
        console.log(`  index.js:   ${target.hasIndex ? '✅' : '❌ Thiếu!'}`);
        console.log(`  data/:      ${target.hasData ? '✅' : '—'}`);
        console.log(`  Commands:   ${target.commandCount} file`);
        if (allCmds.length > 0) {
            allCmds.forEach(f => console.log(`              · ${f}`));
        }
        if (target.dependencies.length > 0) {
            console.log(`  Phụ thuộc: ${target.dependencies.join(', ')}`);
        }
        if (!target.inConfig) {
            console.log('\n  ⚠️  Module chưa có trong config/modules.json — chạy Đồng bộ để thêm.');
        }
        console.log('');
    }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function listJsFiles(dir, base) {
    const results = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) {
            results.push(...listJsFiles(full, base));
        } else if (item.name.endsWith('.js')) {
            results.push(path.relative(base, full).replace(/\\/g, '/'));
        }
    }
    return results;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (require.main === module) {
    new ModuleCLI().run().catch(console.error);
}

module.exports = ModuleCLI;
