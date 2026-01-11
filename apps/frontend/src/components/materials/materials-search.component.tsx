
"use client";

import { useState } from "react";
import { Button } from "@gitroom/react/form/button";
import { Input } from "@gitroom/react/form/input";
import { Select } from "@gitroom/react/form/select";

export interface MaterialsSearchProps {
    onSearch: (params: { platform: string; keywords: string; limit: number }) => void;
    isLoading?: boolean;
}

export const MaterialsSearch = (props: MaterialsSearchProps) => {
    const [platform, setPlatform] = useState<string>("xhs");
    const [keywords, setKeywords] = useState<string>("");
    const [limit, setLimit] = useState<number>(3);

    const handleSearch = () => {
        if (!keywords.trim()) return;
        props.onSearch({ platform, keywords, limit });
    };

    return (
        <div className="flex gap-4 items-end bg-sixth p-4 rounded-lg border border-fifth">
            <div className="w-[150px]">
                <Select
                    label="Platform"
                    name="platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    disableForm={true}
                >
                    <option value="xhs">Xiaohongshu</option>
                    <option value="dy">Douyin</option>
                    <option value="bili">Bilibili</option>
                    <option value="wb">Weibo</option>
                </Select>
            </div>
            <div className="w-[100px]">
                <Select
                    label="Pages"
                    name="limit"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    disableForm={true}
                >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="5">5</option>
                    <option value="10">10</option>
                </Select>
            </div>
            <div className="flex-1">
                <Input
                    name="keywords"
                    label="Keywords"
                    placeholder="Enter keywords..."
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    disableForm={true}
                />
            </div>
            <div className="pb-1">
                <Button
                    className="!h-[42px]"
                    onClick={handleSearch}
                    loading={props.isLoading}
                >
                    Search
                </Button>
            </div>
        </div>
    );
};
