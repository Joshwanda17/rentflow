import PersonalLayout from '@/components/layout/PersonalLayout';
import MyProxyInviteLink from '@/components/executive/MyProxyInviteLink';
import MyProxyNotesFeed from '@/components/executive/MyProxyNotesFeed';
import MyWork from '../components/MyWork';

export default function MyWorkPage() {
  return (
    <PersonalLayout title="My work">
      <MyProxyInviteLink />
      <MyProxyNotesFeed />
      <MyWork />
    </PersonalLayout>
  );
}
