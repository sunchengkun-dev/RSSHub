import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://c.biancheng.net/',
};

const parseDetail = ($: CheerioAPI, baseUrl: string) => {
    const $content = $('#arc-body');
    if (!$content.length) {
        return '内容解析失败';
    }
    $content.find('img').each((_, img) => {
        const src = $(img).attr('src');
        if (src) {
            const absoluteUrl = new URL(src, baseUrl).href;
            $(img).attr('src', absoluteUrl.replace(/^http:\/\//i, 'https://'));
        }
    });
    return $content.html() || '正文为空';
};

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const response = await got(targetUrl, {
        headers,
        https: { rejectUnauthorized: false },
    });
    const $ = load(response.data);

    const list = $('#recent-update li')
        .toArray()
        .slice(0, 10)
        .map((el) => {
            // 限制前10条，防止并发过高
            const $li = $(el);
            const $a = $li.find('a');
            return {
                title: $a.text().trim(),
                link: new URL($a.attr('href') || '', baseUrl).href.replace(/^http:\/\//i, 'https://'),
                pubDate: parseDate($li.find('span.table-cell.time').text().trim()),
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const { data } = await got(item.link, {
                        headers,
                        timeout: { request: 5000 }, // 设置超时
                    });
                    return { ...item, description: parseDetail(load(data), baseUrl) };
                } catch {
                    // 如果单篇文章获取失败，不让整个路由报 500，而是返回标题和链接
                    return { ...item, description: '该文章详情内容获取失败，请点击原链接阅读。' };
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
