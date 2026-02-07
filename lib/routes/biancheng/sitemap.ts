import { load } from 'cheerio';

import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';

export const route: Route = {
    path: '/sitemap',
    name: '最新更新',
    categories: ['program-language'],
    example: '/biancheng/sitemap',
    maintainers: ['nczitzk'],
    handler,
    features: {
        requirePuppeteer: false,
        antiCrawler: true,
    },
};

async function handler() {
    const rootUrl = 'https://c.biancheng.net';
    const currentUrl = `${rootUrl}/sitemap/`;

    const response = await got({
        method: 'get',
        url: currentUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });

    const $ = load(response.data);

    const list = $('#recent-update li')
        .toArray()
        .slice(0, 10)
        .map((el) => {
            const $a = $(el).find('a');
            const link = new URL($a.attr('href') || '', rootUrl).href;
            return {
                title: $a.text().trim(),
                link,
            } as DataItem;
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link!, async () => {
                const detailResponse = await got({
                    method: 'get',
                    url: item.link,
                    headers: {
                        Referer: currentUrl,
                    },
                });

                const $d = load(detailResponse.data);
                const $content = $d('#arc-body');

                $content.find('script, style, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();

                item.description = $content.html() || undefined;

                return item;
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: currentUrl,
        item: items as DataItem[],
    };
}
