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

                // 修复：使用正确的选择器 #arc-body 提取文章正文
                const description = $detail('#arc-body').html() || '无内容';
                
                // 修复日期解析问题
                let pubDate;
                try {
                    // 尝试多种选择器获取日期
                    const dateText = $detail('.info .time').text() || 
                                    $detail('.post-time').text() ||
                                    $detail('.date').text() ||
                                    $detail('meta[property="article:published_time"]').attr('content') ||
                                    $detail('meta[name="publish-date"]').attr('content');
                    
                    if (dateText) {
                        // 清理日期文本，提取日期部分
                        const dateMatch = dateText.match(/\d{4}-\d{2}-\d{2}/) || 
                                         dateText.match(/\d{4}\/\d{2}\/\d{2}/);
                        
                        if (dateMatch) {
                            pubDate = parseDate(dateMatch[0]);
                        } else {
                            // 尝试直接解析
                            pubDate = parseDate(dateText);
                        }
                    }
                    
                    // 如果还是无法解析，使用当前日期
                    if (!pubDate || isNaN(pubDate.getTime())) {
                        pubDate = new Date();
                    }
                } catch (error) {
                    // 如果解析出错，使用当前日期
                    pubDate = new Date();
                }

                return {
                    title: item.title,
                    link: item.link,
                    description,
                    pubDate: pubDate,
                } as DataItem;
            })
        )
    );

    return {
        title: 'C语言中文网 - 最近更新',
        link: targetUrl,
        description: 'C语言中文网 - 最近更新 - Powered by RSSHub',
        item: items,
        lastBuildDate: new Date().toUTCString(), // 添加最后构建时间
        ttl: 60, // 设置缓存时间（分钟）
    };
};

export default handler;