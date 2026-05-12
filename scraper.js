const Parser = require('rss-parser');

const parser = new Parser({
    customFields: {
        item: [['media:content', 'mediaContent', { keepArray: false }]],
    },
});

const DEFAULT_FEED = 'https://www.advocate.com/feed';

async function fetchHeadlines(feedUrl = DEFAULT_FEED, limit = 5) {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.slice(0, limit).map(item => ({
        title: item.title.trim(),
        link: item.link,
        summary: item.contentSnippet ? item.contentSnippet.trim() : '',
        imageUrl: item.mediaContent?.$?.url || null,
    }));
}

module.exports = { fetchHeadlines };
