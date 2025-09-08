# Hướng dẫn tạo Module

## Cấu trúc Module

Mỗi module là một class với các method cơ bản:

```javascript
class MyModule {
  constructor(client) {
    this.client = client;
    this.name = "mymodule";
    this.description = "Mô tả module";
    this.enabled = true;
    this.version = "1.0.0";
  }

  async load() {
    // Khởi tạo module
  }

  async unload() {
    // Dọn dẹp khi tắt module
  }

  // Optional methods
  getModuleInfo() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
    };
  }

  healthCheck() {
    return { healthy: true, issues: [] };
  }
}
```

## Ví dụ Fun Module

### 1. Module chính (src/modules/fun.js)

- Quản lý state của module
- Load/save data
- Cung cấp API cho commands
- Tracking statistics
- Health monitoring

### 2. Commands (src/commands/fun/)

- `/joke` - Random joke
- `/fact` - Random fact
- `/guess` - Number guessing game
- `/gamestats` - Game statistics

### 3. Events (src/events/)

- `funInteraction.js` - Handle button interactions

### 4. Data management

- Auto-create data files
- Save/load JSON data
- User statistics tracking

## Cách test module:

1. **Enable module trong config:**

   ```json
   {
     "modules": {
       "fun": true
     }
   }
   ```

2. **Restart bot hoặc reload module:**

   ```
   /module reload fun
   ```

3. **Test commands:**

   ```
   /joke
   /fact
   /guess max:20
   /gamestats
   ```

4. **Check module status:**
   ```
   /module list
   /module info fun
   /module health fun
   ```

## Best Practices:

1. **Error Handling**: Luôn handle errors gracefully
2. **Data Validation**: Validate input data
3. **Resource Cleanup**: Clean up trong unload()
4. **Health Checks**: Implement health monitoring
5. **Documentation**: Comment code và document APIs
6. **Modular Design**: Tách biệt concerns
7. **Configuration**: Use config cho settings
8. **Logging**: Log important events

## Mở rộng thêm:

- External API integration
- Scheduled tasks
- Cross-module communication
- Plugin system
- Web dashboard
