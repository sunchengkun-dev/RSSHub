console.log('BASE_URL_ENV:', process.env.BASE_URL);
import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const handler = async () => {
    // 1. 建议统一使用 https，减少重定向和安全报错
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    const response = await got(targetUrl);
    const $ = load(response.data);

    const list = $('#recent-update li a')
        .toArray()
        .map((item) => {
            const $item = $(item);
            const rawHref = $item.attr('href') || '';
            return {
                title: $item.text().trim(),
                // 确保 link 是绝对路径
                link: rawHref.startsWith('http') ? rawHref : new URL(rawHref, baseUrl).href,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const $detail = load(detailResponse.data);

                // 2. 优化正文：处理相对路径图片
                const $content = $detail('#arc-body');

                // 将所有图片的相对地址转换为绝对地址
                $content.find('img').each((_, img) => {
                    const src = $detail(img).attr('src');
                    if (src && !src.startsWith('http')) {
                        $detail(img).attr('src', new URL(src, baseUrl).href);
                    }
                });

                const description = $content.html() || '内容获取失败';

                let pubDate;
                try {
                    // 更加健壮的日期提取
                    const infoText = $detail('.info, .info-x, #arc-info').text();
                    const dateMatch = infoText.match(/\d{4}-\d{2}-\d{2}/);

                    if (dateMatch) {
                        pubDate = parseDate(dateMatch[0]);
                    } else {
                        // 尝试从 meta 标签获取
                        const metaDate = $detail('meta[property="article:published_time"]').attr('content');
                        pubDate = metaDate ? parseDate(metaDate) : new Date();
                    }
                } catch {
                    pubDate = new Date();
                }

                // 强制校验 Date 对象有效性
                if (!pubDate || Number.isNaN(pubDate.getTime())) {
                    pubDate = new Date();
                }

                return {
                    title: item.title,
                    link: item.link,
                    description,
                    pubDate,
                } as DataItem;
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        item: items.filter((i) => i !== null),
        // 强制声明允许的域
        allowEmpty: false,
    };
};

export default handler;
