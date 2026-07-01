'use strict';

/**
 * Static list of well-known free SSH account providers. These are
 * third-party websites; Waslah does not create accounts on them, it only
 * opens the link in the user's default browser (see app:openExternal).
 */
const SSH_PROVIDERS = [
  { name: 'FastSSH', url: 'https://www.fastssh.com', notes: 'حسابات SSH/V2Ray مجانية بمدة صلاحية قصيرة' },
  { name: 'SSHOcean', url: 'https://www.sshocean.com', notes: 'سيرفرات متعددة الدول' },
  { name: 'SSHStores', url: 'https://sshstores.store', notes: 'SSH + VPN + V2Ray' },
  { name: 'CloudSSH', url: 'https://www.cloudssh.io', notes: 'حسابات سحابية مجانية ومدفوعة' },
  { name: 'SSHMax', url: 'https://sshmax.net', notes: 'سيرفرات آسيا وأوروبا' },
];

module.exports = { SSH_PROVIDERS };
