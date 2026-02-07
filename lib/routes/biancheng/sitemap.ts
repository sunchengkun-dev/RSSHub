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

    // 1. 获取列表页
    const response = await got(targetUrl, {
        headers,
        https: { rejectUnauthorized: false },
    });
    const $ = load(response.data);

    // 2. 限制条数到 5 条，极大降低内存占用和 500 概率
    const list = $('#recent-update li')
        .toArray()
        .slice(0, 5)
        .map((el) => {
            const $li = $(el);
            const $a = $li.find('a');
            return {
                title: $a.text().trim(),
                link: new URL($a.attr('href') || '', baseUrl).href.replace(/^http:\/\//i, 'https://'),
                pubDate: parseDate($li.find('span.table-cell.time').text().trim()),
            };
        });

    // 3. 详情页处理：增加 null 检查，防止 cache 穿透
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const detailRes = await got(item.link, { headers, timeout: { request: 3000 } });
                    const $detail = load(detailRes.data);
                    const content = $detail('#arc-body').html() || '正文解析失败';
                    return {
                        ...item,
                        description: content,
                    };
                } catch {
                    return { ...item, description: '内容加载超时' };
                }
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        item: items.filter((i): i is DataItem => i !== null),
    };
};

export default handler;
