import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

// 定义通用的伪装请求头，防止 403 报错
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://c.biancheng.net/',
};

// 详情页解析逻辑
const parseDetail = ($: CheerioAPI, baseUrl: string) => {
    const $content = $('#arc-body');
    if (!$content.length) {
        return '内容获取失败或正文结构已改变';
    }

    // 修正正文内的图片路径，并强制转换为 https 避免混合内容问题
    $content.find('img').each((_, img) => {
        const src = $(img).attr('src');
        if (src) {
            // 将相对路径转为绝对路径，并统一替换为 https
            const absoluteUrl = new URL(src, baseUrl).href;
            $(img).attr('src', absoluteUrl.replace(/^http:\/\//i, 'https://'));
        }
    });
    return $content.html() || '内容为空';
};

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    // 请求站点地图，加入 headers 和关闭证书校验
    const response = await got(targetUrl, {
        headers,
        https: { rejectUnauthorized: false },
    });
    const $ = load(response.data);

    // 列表解析逻辑
    const list = $('#recent-update li')
        .toArray()
        .map((el) => {
            const $li = $(el);
            const $a = $li.find('a');
            const rawDate = $li.find('span.table-cell.time').text().trim();

            return {
                title: $a.text().trim(),
                link: new URL($a.attr('href') || '', baseUrl).href.replace(/^http:\/\//i, 'https://'),
                pubDate: parseDate(rawDate),
            };
        });

    // 并行获取正文内容
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data } = await got(item.link, {
                    headers,
                    https: { rejectUnauthorized: false },
                });
                const description = parseDetail(load(data), baseUrl);
                return { ...item, description } as DataItem;
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        // 过滤掉可能的空值，确保数据健壮性
        item: items.filter((i): i is DataItem => i !== null && i !== undefined),
    };
};

export default handler;
