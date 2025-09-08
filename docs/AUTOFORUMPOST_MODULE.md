# AutoForumPost Module - Updated Design

## Overview

The AutoForumPost module has been completely redesigned to find existing forum posts by hashtag matching instead of creating new posts. This approach allows for better organization and prevents duplicate posts.

## Core Features

### 1. Hashtag-Based Thread Matching

- Extracts hashtags from messages using pattern: `#[a-zA-Z0-9_]+`
- Searches through active and archived forum threads
- Matches thread names with extracted hashtags (case-insensitive)
- Sends messages to the first matching thread found

### 2. X.com Link Fixing

- Automatically replaces X.com/Twitter.com links with fixvx.com
- Maintains original link structure while improving preview functionality
- Integrated into the message sending process

### 3. Message Deletion System

- Tracks all sent forum messages in database
- Adds 🗑️ reaction to original messages
- Users can delete forum messages by reacting with 🗑️
- Only message author or users with ManageMessages permission can delete

### 4. Simplified Setup

- No longer requires tag specification
- Setup only needs source channel and forum channel
- Works with any hashtags in messages

## Database Schema

### auto_forum_settings

```sql
- guild_id: VARCHAR(20) PRIMARY KEY
- channel_id: VARCHAR(20) NOT NULL
- forum_id: VARCHAR(20) NOT NULL
- created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### auto_forum_messages (New)

```sql
- id: INT AUTO_INCREMENT PRIMARY KEY
- original_message_id: VARCHAR(20) NOT NULL
- forum_message_id: VARCHAR(20) NOT NULL
- thread_id: VARCHAR(20) NOT NULL
- user_id: VARCHAR(20) NOT NULL
- guild_id: VARCHAR(20) NOT NULL
- created_at: TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

## Commands

### Setup Command

- **Slash:** `/autoforumpost_setup source-channel:<channel> forum-channel:<forum>`
- **Prefix:** `!autoforumpost-setup #source-channel #forum-channel`
- **Purpose:** Configure channel monitoring for hashtag-based forum posting

### List Command

- **Slash:** `/autoforumpost_list`
- **Prefix:** `!autoforumpost-list`
- **Purpose:** Show all configured auto forum setups in the server

### Remove Command

- **Slash:** `/autoforumpost_remove source-channel:<channel>`
- **Prefix:** `!autoforumpost-remove #source-channel`
- **Purpose:** Remove auto forum configuration for a channel

## How It Works

1. **Message Processing:**

   - Monitor configured source channels for new messages
   - Extract hashtags from message content
   - Check if message contains X.com/Twitter.com links

2. **Thread Finding:**

   - Search forum's active threads first
   - If no match, search archived threads
   - Match thread names with extracted hashtags (case-insensitive)

3. **Message Sending:**

   - Fix any X.com links in message content
   - Send message to first matching thread
   - Track message IDs in database
   - Add 🗑️ reaction to original message

4. **Deletion Handling:**
   - Listen for 🗑️ reactions on tracked messages
   - Verify user permissions (author or ManageMessages)
   - Delete forum message and remove from database
   - Remove tracking reaction

## File Structure

```
src/
├── modules/
│   └── autoForumPost.js          # Main module logic
├── commands/autoforumpost/
│   ├── setup.js                  # Setup command
│   ├── list.js                   # List configurations
│   └── remove.js                 # Remove configuration
└── utils/
    └── LinkFixer.js              # X.com link replacement utility
```

## Key Methods

### autoForumPost.js

- `sendToForum()` - Main message processing and sending logic
- `extractHashtags()` - Extract hashtags from message content
- `findMatchingThread()` - Find forum thread by hashtag
- `trackMessage()` - Save message tracking to database
- `handleReaction()` - Process deletion reactions
- `deleteForumMessages()` - Remove forum messages

### LinkFixer.js

- `fixXLinks()` - Replace X.com links with fixvx.com
- `hasXLinks()` - Check if text contains X.com links
- `extractXLinks()` - Extract all X.com links from text

## Benefits

1. **Better Organization:** Messages go to existing relevant threads
2. **No Duplicates:** Prevents creation of multiple similar threads
3. **Link Enhancement:** Automatic X.com link fixing for better previews
4. **User Control:** Easy deletion system with reaction-based interface
5. **Simplified Setup:** No need to specify tags in advance
