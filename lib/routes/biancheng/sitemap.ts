import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache'; // 引入全局缓存模块
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const requestConfig = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Referer: baseUrl,
        },
        timeout: 20000,
        https: { rejectUnauthorized: false },
        http2: false,
    };

    // 1. 获取列表页
    const response = await got(targetUrl, requestConfig);
    const $ = load(response.data);

    // 2. 解析基本信息
    const list = $('#recent-update li')
        .toArray()
        .slice(0, 10)
        .map((el) => {
            const $li = $(el);
            const $a = $li.find('a');
            const rawLink = $a.attr('href') || '';
            const link = rawLink.startsWith('http') ? rawLink : new URL(rawLink, baseUrl).href;

            return {
                title: $a.text().trim(),
                link,
                pubDate: parseDate($li.find('span.table-cell.time').text().trim()),
            } as DataItem;
        });

    // 3. 使用全局 cache.tryGet 抓取全文
    const items = (await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link as string, async () => {
                try {
                    const detailResponse = await got(item.link as string, requestConfig);
                    const $detail = load(detailResponse.data);

                    // 选择正文容器
                    const content = $detail('#arc-body');

                    // 移除干扰元素：脚本、翻页、广告
                    content.find('script, .pre-next, #ad-arc-top, #ad-arc-bottom, .p-ad').remove();

                    // 处理图片：如果图片加载不出，通常需要处理 lazyload 属性
                    content.find('img').each((_, img) => {
                        const $img = $detail(img);
                        const realSrc = $img.attr('data-src') || $img.attr('src');
                        if (realSrc) {
                            $img.attr('src', realSrc);
                            $img.removeAttr('data-src');
                        }
                    });

                    item.description = content.html() || '内容为空';
                    return item;
                } catch (error) {
                    item.description = `全文抓取失败: ${error}`;
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
