#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class ModuleCLI {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config', 'modules.json');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async run() {
        console.log('🔧 Discord Bot Module Manager CLI');
        console.log('==================================\n');

        try {
            const config = this.loadConfig();

            while (true) {
                console.log('\nChọn hành động:');
                console.log('1. Liệt kê modules');
                console.log('2. Bật/tắt module');
                console.log('3. Xóa module');
                console.log('4. Chỉnh sửa module');
                console.log('5. Thoát');

                const choice = await this.question('\nNhập lựa chọn (1-5): ');

                switch (choice) {
                    case '1':
                        this.listModules(config);
                        break;
                    case '2':
                        await this.toggleModule(config);
                        break;
                    case '3':
                        await this.removeModule(config);
                        break;
                    case '4':
                        await this.editModule(config);
                        break;
                    case '5':
                        console.log('👋 Tạm biệt!');
                        this.rl.close();
                        return;
                    default:
                        console.log('❌ Lựa chọn không hợp lệ!');
                }
            }
        } catch (error) {
            console.error('❌ Lỗi:', error.message);
            this.rl.close();
        }
    }

    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                console.log('📁 Tạo file config mới...');
                this.createDefaultConfig();
            }

            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Không thể đọc file config: ${error.message}`);
        }
    }

    saveConfig(config) {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            console.log('💾 Đã lưu cấu hình!');
        } catch (error) {
            console.error('❌ Không thể lưu config:', error.message);
        }
    }

    createDefaultConfig() {
        const defaultConfig = {
            modules: {
                fun: {
                    enabled: true,
                    description: "Fun commands and games",
                    category: "Entertainment",
                    commands: ["8ball", "dice", "coinflip"],
                    dependencies: []
                },
                autoforumpost: {
                    enabled: true,
                    description: "Automated forum posting features",
                    category: "Automation",
                    commands: ["setup", "remove", "list", "filter-settings"],
                    dependencies: ["Database"]
                },
                xfixer: {
                    enabled: true,
                    description: "Automatically fixes X.com links",
                    category: "Utility",
                    commands: ["exclude", "include", "list", "settings"],
                    dependencies: ["Database"]
                }
            },
            settings: {
                autoLoadNewModules: true,
                enabledByDefault: true,
                allowRuntimeToggle: true
            }
        };

        const configDir = path.dirname(this.configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        this.saveConfig(defaultConfig);
        return defaultConfig;
    }

    listModules(config) {
        console.log('\n📋 Danh sách modules:');
        console.log('===================');

        const modules = config.modules;
        const categories = {};

        // Group by category
        for (const [name, moduleData] of Object.entries(modules)) {
            const category = moduleData.category || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push({ name, ...moduleData });
        }

        for (const [category, moduleList] of Object.entries(categories)) {
            console.log(`\n📂 ${category}:`);
            moduleList.forEach(module => {
                const status = module.enabled ? '✅' : '❌';
                const commands = module.commands ? ` (${module.commands.length} cmd)` : '';
                console.log(`  ${status} ${module.name}${commands} - ${module.description}`);
            });
        }
    }

    async toggleModule(config) {
        const moduleName = await this.question('\nNhập tên module: ');

        if (!config.modules[moduleName]) {
            console.log('❌ Module không tồn tại!');
            return;
        }

        const currentStatus = config.modules[moduleName].enabled;
        const newStatus = !currentStatus;

        config.modules[moduleName].enabled = newStatus;
        this.saveConfig(config);

        const statusText = newStatus ? 'bật' : 'tắt';
        console.log(`✅ Đã ${statusText} module '${moduleName}'!`);
    }

    async removeModule(config) {
        const moduleName = await this.question('\nNhập tên module cần xóa: ');

        if (!config.modules[moduleName]) {
            console.log('❌ Module không tồn tại!');
            return;
        }

        const confirm = await this.question(`⚠️  Bạn có chắc muốn xóa module '${moduleName}'? (y/n): `);

        if (confirm.toLowerCase() === 'y' || confirm.toLowerCase() === 'yes') {
            delete config.modules[moduleName];
            this.saveConfig(config);
            console.log(`🗑️ Đã xóa module '${moduleName}'!`);
        } else {
            console.log('❌ Hủy bỏ xóa module.');
        }
    }

    async editModule(config) {
        const moduleName = await this.question('\nNhập tên module cần chỉnh sửa: ');

        if (!config.modules[moduleName]) {
            console.log('❌ Module không tồn tại!');
            return;
        }

        const module = config.modules[moduleName];
        console.log(`\nThông tin hiện tại của '${moduleName}':`);
        console.log(`- Mô tả: ${module.description}`);
        console.log(`- Danh mục: ${module.category}`);
        console.log(`- Trạng thái: ${module.enabled ? 'Bật' : 'Tắt'}`);

        const newDescription = await this.question(`Mô tả mới (để trống giữ nguyên): `);
        const newCategory = await this.question(`Danh mục mới (để trống giữ nguyên): `);
        const toggleStatus = await this.question(`Đổi trạng thái? (y/n): `);

        if (newDescription.trim()) {
            module.description = newDescription;
        }
        if (newCategory.trim()) {
            module.category = newCategory;
        }
        if (toggleStatus.toLowerCase() === 'y') {
            module.enabled = !module.enabled;
        }

        this.saveConfig(config);
        console.log(`✅ Đã cập nhật module '${moduleName}'!`);
    }

    question(prompt) {
        return new Promise((resolve) => {
            this.rl.question(prompt, resolve);
        });
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new ModuleCLI();
    cli.run().catch(console.error);
}

module.exports = ModuleCLI;
