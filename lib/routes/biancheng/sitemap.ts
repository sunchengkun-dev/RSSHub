import { load } from 'cheerio';

import type { DataItem } from '@/types'; // 导入类型定义
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const handler = async () => {
    const baseUrl = 'http://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const response = await got(targetUrl);
    const $ = load(response.data);

    // 修复：使用 .toArray() 代替 .get()，符合 RSSHub 规范
    const list = $('#recent-update li a')
        .toArray()
        .map((item) => {
            const $item = $(item);
            return {
                title: $item.text(),
                link: new URL($item.attr('href') || '', baseUrl).href,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const $detail = load(detailResponse.data);

                // 提取文章正文
                const description = $detail('#article').html() || '无内容';

                return {
                    title: item.title,
                    link: item.link,
                    description,
                    // 尝试获取发布时间
                    pubDate: parseDate($detail('.info .time').text()) || new Date().toUTCString(),
                } as DataItem;
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        item: items,
    };
};

// 修复：具名导出，避免匿名导出报错
export default handler;
