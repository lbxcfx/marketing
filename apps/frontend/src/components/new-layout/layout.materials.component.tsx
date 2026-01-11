'use client';

import { MaterialsComponent } from '@gitroom/frontend/components/materials/materials.component';

export const MaterialsLayoutComponent = () => {
  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[16px] transition-all">
      <MaterialsComponent />
    </div>
  );
};
