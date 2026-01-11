import {
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class XiaohongshuDto {
    @IsOptional()
    @IsString()
    @MaxLength(20, { message: '标题最多20个字符' })
    title?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsString()
    scheduled_time?: string;
}
