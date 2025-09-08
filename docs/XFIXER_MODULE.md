# XFixer Module Documentation

## Overview

The XFixer module automatically detects X.com (formerly Twitter) links in Discord messages and converts them to fixvx.com links for better embed display. It includes channel exclusion functionality to prevent processing in specific channels.

## Features

- **Automatic Detection**: Monitors all messages for X.com and Twitter.com links
- **Smart Replacement**: Converts links to fixvx.com while preserving all parameters
- **Message Deletion**: Automatically deletes original messages with X.com links (configurable)
- **Channel Exclusion**: Ability to exclude specific channels from link fixing
- **Management Commands**: Commands to manage excluded channels and settings
- **Database Integration**: Persistent storage of exclusion settings and preferences
- **Safe Processing**: Only processes valid URLs, handles errors gracefully

## How It Works

### Link Detection

The module uses regex to detect:

- `https://x.com/...`
- `https://www.x.com/...`
- `https://twitter.com/...`
- `https://www.twitter.com/...`

### Link Conversion

Original: `https://x.com/pixelvertice/status/1951500101215777259?s=46`
Fixed: `https://fixvx.com/pixelvertice/status/1951500101215777259?s=46`

### Message Handling

When X.com links are detected:

1. Checks if channel is excluded from processing
2. Bot replaces domain with `fixvx.com`
3. Sends new message with fixed links
4. Attributes message to original author
5. Optionally deletes the original message (based on server settings)
6. Prevents mention spam with `allowedMentions: { parse: [] }`

## Commands

### `/xfixer_exclude`

**Purpose**: Exclude a channel from X link fixing
**Usage**: `/xfixer_exclude channel:#channel-name`
**Permissions**: Manage Channels

### `/xfixer_include`

**Purpose**: Include a previously excluded channel back in X link fixing
**Usage**: `/xfixer_include channel:#channel-name`
**Permissions**: Manage Channels

### `/xfixer_list`

**Purpose**: List all channels excluded from X link fixing
**Usage**: `/xfixer_list`
**Permissions**: Manage Channels

### `/xfixer_settings`

**Purpose**: Manage XFixer settings for the server
**Usage**:

- `/xfixer_settings view` - View current settings
- `/xfixer_settings delete-original true/false` - Toggle message deletion
  **Permissions**: Manage Channels

## Configuration

### Environment Variables

```bash
# Enable/disable the module
MODULE_XFIXER=true  # or false to disable
```

### Database Tables

The module creates the following tables:

```sql
xfixer_excluded_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_guild_channel (guild_id, channel_id)
)

xfixer_settings (
    guild_id VARCHAR(20) PRIMARY KEY,
    delete_original BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
```

### Module States

- **Enabled**: Automatically processes messages (except excluded channels)
- **Disabled**: No link processing occurs

### Server Settings

- **Delete Original**: Whether to delete the original message after fixing (default: true)
- **Excluded Channels**: List of channels where link fixing is disabled
- **Disabled**: No link processing occurs

## Examples

### Single Link

**User message:**

```
Check this out: https://x.com/user/status/123456789
```

**Bot response:**

```
**Fixed links from @User:**
Check this out: https://fixvx.com/user/status/123456789
```

### Multiple Links

**User message:**

```
Two links:
https://x.com/user1/status/111
https://twitter.com/user2/status/222
```

**Bot response:**

```
**Fixed links from @User:**
Two links:
https://fixvx.com/user1/status/111
https://fixvx.com/user2/status/222
```

## Technical Details

### Event Handling

- **Event**: `messageCreate`
- **Filters**: Ignores bot messages and system messages
- **Processing**: Real-time link detection and replacement

### URL Processing

```javascript
fixXLink(link) {
    const url = new URL(link);
    if (url.hostname.includes('x.com') || url.hostname.includes('twitter.com')) {
        url.hostname = 'fixvx.com';
        return url.toString();
    }
    return link;
}
```

### Error Handling

- Invalid URLs are safely ignored
- Module continues operating if individual messages fail
- All errors logged for debugging

## Health Check

The module provides a health check endpoint:

- **Status**: `healthy` | `unhealthy`
- **Test**: Validates URL parsing functionality
- **Monitoring**: Can be checked via `/module health xfixer`

## Statistics

- **Links Fixed**: Count of X.com links converted (future feature)
- **Messages Processed**: Total messages scanned (future feature)

## Benefits

1. **Better Embeds**: fixvx.com provides superior embed previews
2. **Automatic**: No user action required
3. **Preserves Context**: Maintains original message attribution
4. **Safe**: Only processes valid URLs

## Configuration Examples

### Enable Module

```bash
MODULE_XFIXER=true
```

### Disable Module

```bash
MODULE_XFIXER=false
```

## Troubleshooting

### Module Not Working

1. Check if module is enabled in `.env`
2. Verify module loaded: `/module list`
3. Check module health: `/module health xfixer`

### Links Not Converting

1. Ensure URLs are valid X.com/Twitter.com links
2. Check bot has permission to send messages in channel
3. Review bot logs for error messages

## Future Enhancements

- Statistics tracking
- Configurable domains to fix
- Optional deletion of original message
- Custom message formatting
- Per-server enable/disable
