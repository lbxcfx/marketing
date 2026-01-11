import {
    IsArray,
    IsBoolean,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class DouyinDto {
    @IsOptional()
    @IsString()
    @MaxLength(30, { message: '标题最多30个字符' })
    title?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    scheduled_time?: string;

    @IsOptional()
    @IsString()
    thumbnail_url?: string;

    @IsOptional()
    @IsString()
    product_link?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10, { message: '商品标题最多10个字符' })
    product_title?: string;

    @IsOptional()
    @IsBoolean()
    enable_comments?: boolean;
}
