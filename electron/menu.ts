import { Menu, MenuItemConstructorOptions, BrowserWindow, app, shell } from 'electron';

export function setupApplicationMenu(mainWindow: BrowserWindow) {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const, label: '关于宝藏排版器' },
              { type: 'separator' as const },
              {
                label: '偏好设置...',
                accelerator: 'CmdOrCtrl+,',
                click: () => mainWindow.webContents.send('menu:action', 'open-about'),
              },
              { type: 'separator' as const },
              { role: 'services' as const, label: '服务' },
              { type: 'separator' as const },
              { role: 'hide' as const, label: '隐藏' },
              { role: 'hideOthers' as const, label: '隐藏其他' },
              { role: 'unhide' as const, label: '全部显示' },
              { type: 'separator' as const },
              { role: 'quit' as const, label: '退出' },
            ],
          },
        ]
      : []),
    {
      label: '文件 (File)',
      submenu: [
        {
          label: '新建文章',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:action', 'new-file'),
        },
        {
          label: '打开 Markdown...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:action', 'open-file'),
        },
        {
          label: '保存文章',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:action', 'save-file'),
        },
        { type: 'separator' },
        {
          label: '复制到公众号 (富文本)',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => mainWindow.webContents.send('menu:action', 'copy-wechat'),
        },
        {
          label: '导出为 HTML 文件...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('menu:action', 'export-html'),
        },
        {
          label: '导出为 PDF...',
          click: () => mainWindow.webContents.send('menu:action', 'export-pdf'),
        },
        {
          label: '导出为长图 (PNG)...',
          click: () => mainWindow.webContents.send('menu:action', 'export-longimage'),
        },
        { type: 'separator' },
        isMac
          ? { role: 'close' as const, label: '关闭窗口' }
          : { role: 'quit' as const, label: '退出' },
      ],
    },
    {
      label: '编辑 (Edit)',
      submenu: [
        { role: 'undo' as const, label: '撤销' },
        { role: 'redo' as const, label: '重做' },
        { type: 'separator' },
        { role: 'cut' as const, label: '剪切' },
        { role: 'copy' as const, label: '复制' },
        { role: 'paste' as const, label: '粘贴' },
        { role: 'selectAll' as const, label: '全选' },
        { type: 'separator' },
        {
          label: 'AI 助手',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow.webContents.send('menu:action', 'open-ai'),
        },
        {
          label: '中英文排版优化',
          click: () => mainWindow.webContents.send('menu:action', 'format-pangu'),
        },
        { type: 'separator' },
        {
          label: '插入表情包',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow.webContents.send('menu:action', 'open-sticker'),
        },
        {
          label: '文章背景设置',
          click: () => mainWindow.webContents.send('menu:action', 'open-background'),
        },
      ],
    },
    {
      label: '视图 (View)',
      submenu: [
        {
          label: '左右分栏',
          click: () => mainWindow.webContents.send('menu:action', 'layout-horizontal'),
        },
        {
          label: '上下分栏',
          click: () => mainWindow.webContents.send('menu:action', 'layout-vertical'),
        },
        {
          label: '专注编辑（仅编辑器）',
          click: () => mainWindow.webContents.send('menu:action', 'layout-editor'),
        },
        {
          label: '专注预览（仅预览）',
          click: () => mainWindow.webContents.send('menu:action', 'layout-preview'),
        },
        { type: 'separator' },
        {
          label: '全宽预览',
          click: () => mainWindow.webContents.send('menu:action', 'view-default'),
        },
        {
          label: '手机样机预览',
          accelerator: 'CmdOrCtrl+M',
          click: () => mainWindow.webContents.send('menu:action', 'view-mobile'),
        },
        {
          label: '平板样机预览',
          click: () => mainWindow.webContents.send('menu:action', 'view-tablet'),
        },
        {
          label: '电脑客户端预览',
          click: () => mainWindow.webContents.send('menu:action', 'view-desktop'),
        },
        { type: 'separator' },
        { role: 'reload' as const, label: '重新加载' },
        { role: 'forceReload' as const, label: '强制重新加载' },
        { role: 'toggleDevTools' as const, label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom' as const, label: '重置缩放' },
        { role: 'zoomIn' as const, label: '放大' },
        { role: 'zoomOut' as const, label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen' as const, label: '切换全屏' },
      ],
    },
    {
      label: '帮助 (Help)',
      submenu: [
        {
          label: 'gzh-design-skill 官方规范',
          click: async () => {
            await shell.openExternal('https://github.com/isjiamu/gzh-design-skill');
          },
        },
        {
          label: '关于宝藏排版器',
          click: () => mainWindow.webContents.send('menu:action', 'open-about'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
