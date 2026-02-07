import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const requestConfig = {
        headers: {
            // 1. 使用极其真实的 UA
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            Referer: 'https://www.google.com/', // 模拟从搜索引擎进入，有时能绕过拦截
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
        },
        timeout: 25000,
        https: {
            rejectUnauthorized: false,
            // 2. 强制指定加密套件，模拟现代浏览器，这是绕过 Cloudflare 的关键
            ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256',
        },
        // 3. 必须为 false，因为 Node 的 HTTP/2 指纹极其明显
        http2: false,
    };

    const response = await got(targetUrl, requestConfig);
    const $ = load(response.data);

    // ... 解析逻辑保持不变 ...
    const list = $('#recent-update li')
        .toArray()
        .slice(0, 10)
        .map((el) => {
            const $li = $(el);
            const $a = $li.find('a');
            const link = new URL($a.attr('href') || '', baseUrl).href;
            return {
                title: $a.text().trim(),
                link,
                pubDate: parseDate($li.find('span.table-cell.time').text().trim()),
            } as DataItem;
        });

    const items = (await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link as string, async () => {
                try {
                    // 详情页请求也使用同样的配置
                    const detailResponse = await got(item.link as string, requestConfig);
                    const $detail = load(detailResponse.data);
                    const content = $detail('#arc-body');
                    content.find('script, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();
                    item.description = content.html() || '内容为空';
                    return item;
                } catch {
                    return item;
                }
            })
        )
    )) as DataItem[];

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        item: items,
    };
};

export default handler;
