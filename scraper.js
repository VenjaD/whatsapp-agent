const Parser = require('rss-parser');

const parser = new Parser();

// BBC News RSS feeds — swap FEED_URL in .env to target a different topic
const DEFAULT_FEED = 'http://feeds.bbci.co.uk/news/rss.xml';

async function fetchHeadlines(feedUrl = DEFAULT_FEED, limit = 5) {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.slice(0, limit).map(item => ({
        title: item.title.trim(),
        link: item.link,
        summary: item.contentSnippet ? item.contentSnippet.trim() : '',
    }));
}

module.exports = { fetchHeadlines };
