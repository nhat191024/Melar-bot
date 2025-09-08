const Logger = require('./Logger');

class LinkFixer {
    /**
     * Replace X.com links with fixvx.com links
     * @param {string} content - Message content to process
     * @returns {string} - Content with fixed links
     */
    static fixXLinks(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }

        try {
            // Pattern to match x.com and twitter.com links
            const xLinkPattern = /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([^\s]+)/gi;

            const fixedContent = content.replace(xLinkPattern, (match, www, domain, path) => {
                // Replace with fixvx.com
                const fixedLink = `https://fixvx.com/${path}`;
                Logger.info(`Fixed link: ${match} -> ${fixedLink}`);
                return fixedLink;
            });

            return fixedContent;
        } catch (error) {
            Logger.error(`Error fixing X links: ${error.message}`);
            return content;
        }
    }

    /**
     * Check if content contains X.com or Twitter.com links
     * @param {string} content - Content to check
     * @returns {boolean} - True if contains X/Twitter links
     */
    static hasXLinks(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        const xLinkPattern = /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([^\s]+)/gi;
        return xLinkPattern.test(content);
    }

    /**
     * Extract all X.com/Twitter.com links from content
     * @param {string} content - Content to extract from
     * @returns {Array} - Array of found links
     */
    static extractXLinks(content) {
        if (!content || typeof content !== 'string') {
            return [];
        }

        const xLinkPattern = /https?:\/\/(www\.)?(x\.com|twitter\.com)\/([^\s]+)/gi;
        const matches = content.match(xLinkPattern);
        return matches || [];
    }
}

module.exports = LinkFixer;
