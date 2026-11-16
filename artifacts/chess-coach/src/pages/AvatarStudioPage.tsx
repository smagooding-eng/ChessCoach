// /avatar-studio: create and edit your 3D characters (signed-in players).
import { RD } from '@/lib/redesignTheme';
import AvatarStudio from '@/components/avatar-studio/AvatarStudio';

export default function AvatarStudioPage() {
  return (
    <div className="px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3 md:px-5 md:pb-6" style={{ color: RD.text }}>
      <AvatarStudio />
    </div>
  );
}
