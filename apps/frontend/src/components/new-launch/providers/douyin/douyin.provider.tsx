'use client';

import { FC } from 'react';
import {
    PostComment,
    withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { DouyinDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/douyin.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const DouyinSettings: FC<{
    values?: any;
}> = (props) => {
    const { register } = useSettings();
    const t = useT();

    return (
        <div className="flex flex-col gap-4">
            <Input
                label={t('douyin_title', '视频标题')}
                {...register('title')}
                maxLength={30}
                placeholder={t('douyin_title_placeholder', '输入视频标题（最多30字）')}
            />

            <Input
                label={t('douyin_tags', '话题标签')}
                {...register('tags')}
                placeholder={t('douyin_tags_placeholder', '输入话题标签，用空格分隔')}
            />

            <hr className="my-2 border-tableBorder" />

            <div className="text-[14px] font-medium mb-2">
                {t('douyin_product_settings', '商品设置（可选）')}
            </div>

            <Input
                label={t('douyin_product_link', '商品链接')}
                {...register('product_link')}
                placeholder={t('douyin_product_link_placeholder', '粘贴商品链接')}
            />

            <Input
                label={t('douyin_product_title', '商品短标题')}
                {...register('product_title')}
                maxLength={10}
                placeholder={t('douyin_product_title_placeholder', '商品短标题（最多10字）')}
            />

            <hr className="my-2 border-tableBorder" />

            <Checkbox
                variant="hollow"
                label={t('douyin_enable_comments', '允许评论')}
                {...register('enable_comments', {
                    value: true,
                })}
            />

            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-lg text-sm">
                <div className="font-medium text-amber-600 mb-1">
                    {t('douyin_notice', '注意事项')}
                </div>
                <ul className="text-amber-600/80 list-disc list-inside space-y-1">
                    <li>{t('douyin_notice_1', '视频将通过浏览器自动化发布')}</li>
                    <li>{t('douyin_notice_2', '请确保账号已通过扫码登录')}</li>
                    <li>{t('douyin_notice_3', '发布过程中请勿关闭服务')}</li>
                </ul>
            </div>
        </div>
    );
};

export default withProvider({
    postComment: PostComment.POST,
    minimumCharacters: [],
    SettingsComponent: DouyinSettings,
    comments: false,
    dto: DouyinDto,
    checkValidity: async (items) => {
        const [firstItems] = items ?? [];
        if ((firstItems?.length ?? 0) === 0) {
            return '请选择要发布的视频';
        }
        // Douyin only supports single video
        if ((firstItems?.length ?? 0) > 1) {
            return '抖音仅支持单个视频发布';
        }
        // Check if it's a video
        const isVideo = firstItems?.[0]?.path?.indexOf?.('mp4') > -1;
        if (!isVideo) {
            return '抖音仅支持视频内容';
        }
        return true;
    },
    maximumCharacters: 2000,
});
