import { StickerPacks } from '@/components/stickers/StickerPacks';

export const metadata = { title: 'Sticker packs' };

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ pack?: string }>;
}) {
  const params = await searchParams;
  return <StickerPacks initialPack={params?.pack ?? null} />;
}
