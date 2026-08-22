import {
  InvitationEmail,
  type InvitationEmailProps,
} from '../src/templates/invitation.js';

const WithPreview = Object.assign(InvitationEmail, {
  PreviewProps: {
    workspaceName: 'Harbor Shipyard',
    inviterName: 'Grace Hopper',
    role: 'admin',
    actionUrl: 'https://shipyard.app/invite/demo-token',
  } satisfies InvitationEmailProps,
});

export default WithPreview;
