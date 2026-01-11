'use client';

import { FC, useState } from 'react';
import {
    PostComment,
    withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { XiaohongshuDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/xiaohongshu.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const CustomTagInput: FC = () => {
    const { setValue, watch, register } = useSettings();
    const t = useT();

    // Watch the current value of tags to control the input, default to empty array
    const currentTags = watch('tags');
    // Local state to handle the input string
    const [inputValue, setInputValue] = useState(
        Array.isArray(currentTags) ? currentTags.join(' ') : (typeof currentTags === 'string' ? currentTags : '')
    );

    // Register the field manually since we are disabling it in the Input component
    useState(() => {
        register('tags');
    });

    return (
        <Input
            name="tags"
            disableForm={true}
            label={t('xhs_tags', '话题标签')}
            value={inputValue}
            onChange={(e) => {
                const newValue = e.target.value;
                setInputValue(newValue);
                // Convert string to array by splitting on spaces and filtering empty strings
                const tagsArray = newValue.split(' ').filter((tag: string) => tag.trim() !== '');
                setValue('tags', tagsArray, { shouldValidate: true });
            }}
            placeholder={t('xhs_tags_placeholder', '输入话题标签，用空格分隔')}
        />
    );
};

const XiaohongshuSettings: FC<{
    values?: any;
}> = (props) => {
    const { register } = useSettings();
    const t = useT();

    return (
        <div className="flex flex-col gap-4">
            <Input
                label={t('xhs_title', '笔记标题')}
                {...register('title')}
                maxLength={20}
                placeholder={t('xhs_title_placeholder', '输入笔记标题（最多20字）')}
            />

            <CustomTagInput />

            <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg text-sm">
                <div className="font-medium text-rose-600 mb-1">
                    {t('xhs_notice', '注意事项')}
                </div>
                <ul className="text-rose-600/80 list-disc list-inside space-y-1">
                    <li>{t('xhs_notice_1', '支持视频和图片内容')}</li>
                    <li>{t('xhs_notice_2', '请确保账号已通过扫码登录')}</li>
                    <li>{t('xhs_notice_3', '发布过程中请勿关闭服务')}</li>
                    <li>{t('xhs_notice_4', '建议使用高质量的封面图')}</li>
                </ul>
            </div>

            <div className="bg-gray-500/10 border border-gray-500/30 p-3 rounded-lg text-sm">
                <div className="font-medium text-gray-400 mb-1">
                    {t('xhs_content_tips', '内容建议')}
                </div>
                <ul className="text-gray-400/80 list-disc list-inside space-y-1">
                    <li>{t('xhs_tips_1', '标题要吸引人，突出关键词')}</li>
                    <li>{t('xhs_tips_2', '使用热门话题标签增加曝光')}</li>
                    <li>{t('xhs_tips_3', '图片/视频清晰度要高')}</li>
                </ul>
            </div>
        </div>
    );
};

export default withProvider({
    postComment: PostComment.POST,
    minimumCharacters: [],
    SettingsComponent: XiaohongshuSettings,
    comments: false,
    dto: XiaohongshuDto,
    checkValidity: async (items) => {
        const [firstItems] = items ?? [];
        if ((firstItems?.length ?? 0) === 0) {
            return '请选择要发布的视频或图片';
        }
        return true;
    },
    maximumCharacters: 1000,
});
