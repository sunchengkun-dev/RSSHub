import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const headers = {
    // 使用更现代、更像真实浏览器的 User-Agent
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    Referer: 'https://c.biancheng.net/',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    // 1. 获取列表页 - 进一步放宽超时至 30s，并尝试关闭 HTTP2 (有时 HTTP2 握手在海外节点更易失败)
    const response = await got(targetUrl, {
        headers,
        https: { rejectUnauthorized: false },
        timeout: { request: 30000 },
        retry: { limit: 3 }, // 增加重试次数
        http2: false,
    });
    const $ = load(response.data);

    const list = $('#recent-update li')
        .toArray()
        .slice(0, 8)
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
                    http2: false,
                });
                const $detail = load(detailRes.data);
                const content = $detail('#arc-body').html() || '正文解析失败';
                return {
                    ...item,
                    description: content,
                };
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error(`Fetch detail fail for ${item.link}:`, error.message);
                return { ...item, description: `内容暂时无法加载` };
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
