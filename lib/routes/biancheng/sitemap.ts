import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://c.biancheng.net/',
};

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const response = await got(targetUrl, {
        headers,
        https: { rejectUnauthorized: false },
        timeout: { request: 20000 },
    });
    const $ = load(response.data);

    const list = $('#recent-update li')
        .toArray()
        .slice(0, 10)
        .map((el) => {
            const $li = $(el);
            const $a = $li.find('a');
            return {
                title: $a.text().trim(),
                link: new URL($a.attr('href') || '', baseUrl).href.replace(/^http:\/\//i, 'https://'),
                pubDate: parseDate($li.find('span.table-cell.time').text().trim()),
            };
        });

    const items: DataItem[] = [];
    for (const item of list) {
        // eslint-disable-next-line no-await-in-loop
        const cachedItem = (await cache.tryGet(item.link, async () => {
            try {
                const detailRes = await got(item.link, {
                    headers,
                    timeout: { request: 15000 },
                    retry: { limit: 2 },
                });
                const $detail = load(detailRes.data);
                const content = $detail('#arc-body').html() || '正文解析失败';
                return {
                    ...item,
                    description: content,
                };
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(`Fetch detail fail for ${item.link}:`, error);
                return { ...item, description: `内容加载失败` };
            }
        })) as DataItem;

        if (cachedItem) {
            items.push(cachedItem);
        }
    }

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        item: items,
    };
};

export default handler;
