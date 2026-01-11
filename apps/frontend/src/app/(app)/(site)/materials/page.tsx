import { MaterialsLayoutComponent } from '@gitroom/frontend/components/new-layout/layout.materials.component';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';

export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Postiz' : 'Gitroom'} Materials`,
  description: '',
};

export default async function Page() {
  return <MaterialsLayoutComponent />;
}
