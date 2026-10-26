param(
  [string]$Hotkey = 'Ctrl+Alt+S',
  [string]$Mode = 'region',
  [string]$OutDir = "$env:USERPROFILE\Pictures\dsh-shot",
  [string]$LogFile = "$env:USERPROFILE\.dsh\screenshot\hotkey.log"
)

$src = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class ShotOverlay : Form
{
    Bitmap _bg;
    string _outDir;
    string _log;
    Rectangle _sel;
    bool _dragging;
    Point _start;

    public ShotOverlay(Bitmap bg, string outDir, string logFile)
    {
        _bg = bg; _outDir = outDir; _log = logFile;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        Bounds = SystemInformation.VirtualScreen;
        TopMost = true;
        ShowInTaskbar = false;
        Cursor = Cursors.Cross;
        DoubleBuffered = true;
        KeyPreview = true;
    }

    protected override void OnKeyDown(KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Escape) { Close(); }
        base.OnKeyDown(e);
    }

    protected override void OnDeactivate(EventArgs e)
    {
        Close();
        base.OnDeactivate(e);
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Left)
        {
            _dragging = true;
            _start = e.Location;
            _sel = new Rectangle(e.Location, Size.Empty);
            Invalidate();
        }
        base.OnMouseDown(e);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        if (_dragging)
        {
            int x = Math.Min(_start.X, e.X), y = Math.Min(_start.Y, e.Y);
            int w = Math.Abs(e.X - _start.X), h = Math.Abs(e.Y - _start.Y);
            _sel = new Rectangle(x, y, w, h);
            Invalidate();
        }
        base.OnMouseMove(e);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        if (_dragging)
        {
            _dragging = false;
            if (_sel.Width > 4 && _sel.Height > 4)
            {
                try { Save(); } catch (Exception ex) { Log("保存失败: " + ex.Message); }
            }
            Close();
        }
        base.OnMouseUp(e);
    }

    void Log(string m)
    {
        try { File.AppendAllText(_log, "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + m + Environment.NewLine); }
        catch { }
    }

    void Save()
    {
        using (Bitmap crop = _bg.Clone(_sel, _bg.PixelFormat))
        {
            Directory.CreateDirectory(_outDir);
            string name = "shot-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png";
            string path = Path.Combine(_outDir, name);
            crop.Save(path, ImageFormat.Png);
            try { using (Bitmap cb = new Bitmap(crop)) { Clipboard.SetImage(cb); } Log("保存并复制到剪贴板: " + path + " (" + _sel.Width + "x" + _sel.Height + ")"); }
            catch (Exception ex) { Log("保存: " + path + "，但复制剪贴板失败: " + ex.Message); }
            Log("保存: " + path + " (" + _sel.Width + "x" + _sel.Height + ")");
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        g.DrawImage(_bg, 0, 0);

        using (SolidBrush dim = new SolidBrush(Color.FromArgb(120, 0, 0, 0)))
        {
            Region full = new Region(ClientRectangle);
            if (_sel.Width > 0 && _sel.Height > 0)
            {
                full.Exclude(_sel);
            }
            g.FillRegion(dim, full);
        }

        if (_sel.Width > 0 && _sel.Height > 0)
        {
            using (Pen border = new Pen(Color.FromArgb(0, 160, 255), 2))
            {
                g.DrawRectangle(border, _sel);
            }
            string info = _sel.Width + " x " + _sel.Height;
            using (Font f = new Font("Segoe UI", 10f))
            using (SolidBrush tb = new SolidBrush(Color.White))
            {
                Point tp = new Point(_sel.X + 4, _sel.Y + _sel.Height + 4);
                g.FillRectangle(new SolidBrush(Color.FromArgb(160, 0, 0, 0)), tp.X - 2, tp.Y, 110, 22);
                g.DrawString(info, f, tb, tp);
            }
        }
        else
        {
            using (Font f = new Font("Segoe UI", 14f))
            using (SolidBrush tb = new SolidBrush(Color.White))
            {
                g.DrawString("拖动选择区域，Esc 取消", f, tb, 40, 40);
            }
        }
        base.OnPaint(e);
    }
}

public class HotkeyShot
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll")] static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT r);

    static string _log, _outDir, _mode;

    static void Log(string msg)
    {
        try { File.AppendAllText(_log, "[" + DateTime.Now.ToString("HH:mm:ss") + "] " + msg + Environment.NewLine); }
        catch { }
    }

    public static void Run(uint mod, uint vk, string mode, string outDir, string logFile)
    {
        _log = logFile; _outDir = outDir; _mode = mode;
        Directory.CreateDirectory(_outDir);
        Directory.CreateDirectory(Path.GetDirectoryName(_log));

        if (!RegisterHotKey(IntPtr.Zero, 1, mod, vk))
        {
            Log("注册失败 vk=" + vk + " mod=" + mod);
            return;
        }
        Log("已注册 mod=" + mod + " vk=" + vk + " mode=" + mode);

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0))
        {
            if (msg.message == 0x0312)
            {
                try { Trigger(); }
                catch (Exception e) { Log("截图失败: " + e.Message); }
            }
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }

    static void Trigger()
    {
        if (_mode == "full" || _mode == "window")
        {
            CaptureDirect();
            return;
        }

        Rectangle vs = SystemInformation.VirtualScreen;
        Bitmap bg = new Bitmap(vs.Width, vs.Height);
        using (Graphics g = Graphics.FromImage(bg))
        {
            g.CopyFromScreen(vs.X, vs.Y, 0, 0, vs.Size);
        }
        using (ShotOverlay f = new ShotOverlay(bg, _outDir, _log))
        {
            f.ShowDialog();
        }
        bg.Dispose();
    }

    static void CaptureDirect()
    {
        Rectangle bounds;
        if (_mode == "window")
        {
            IntPtr h = GetForegroundWindow();
            RECT r;
            if (GetWindowRect(h, out r))
            {
                int w = r.Right - r.Left, hh = r.Bottom - r.Top;
                bounds = (w > 0 && hh > 0) ? new Rectangle(r.Left, r.Top, w, hh) : SystemInformation.VirtualScreen;
            }
            else bounds = SystemInformation.VirtualScreen;
        }
        else bounds = SystemInformation.VirtualScreen;

        using (Bitmap bmp = new Bitmap(bounds.Width, bounds.Height))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(bounds.X, bounds.Y, 0, 0, bounds.Size);
            }
            string path = Path.Combine(_outDir, "shot-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png");
            bmp.Save(path, ImageFormat.Png);
            try { using (Bitmap cb = new Bitmap(bmp)) { Clipboard.SetImage(cb); } Log("保存并复制到剪贴板: " + path); }
            catch (Exception ex) { Log("保存: " + path + "，但复制剪贴板失败: " + ex.Message); }
            Log("保存: " + path);
        }
    }
}
'@

if (-not ("HotkeyShot" -as [type])) {
  Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms, System.Drawing
}

$mod = 0
$parts = $Hotkey -split '\+'
$key = $parts[-1].Trim().ToUpper()
if ($parts -match 'CTRL')  { $mod = $mod -bor 0x0002 }
if ($parts -match 'ALT')   { $mod = $mod -bor 0x0001 }
if ($parts -match 'SHIFT') { $mod = $mod -bor 0x0004 }
if ($parts -match 'WIN')   { $mod = $mod -bor 0x0008 }

if ($key.Length -eq 1 -and $key -match '[A-Z0-9]') {
  $vk = [int][char]$key
} elseif ($key -match '^F(\d{1,2})$') {
  $vk = 0x70 + [int]$Matches[1] - 1
} else {
  $map = @{ 'PRINTSCREEN' = 0x2C; 'SPACE' = 0x20; 'ENTER' = 0x0D; 'TAB' = 0x09; 'ESC' = 0x1B; 'INSERT' = 0x2D; 'HOME' = 0x24; 'END' = 0x23 }
  if ($map.ContainsKey($key)) { $vk = $map[$key] } else { $vk = [int][char]$key[0] }
}

[HotkeyShot]::Run([uint32]$mod, [uint32]$vk, $Mode, $OutDir, $LogFile)

# 全局快捷键 -> 截图（微信式：按热键 → 冻结屏幕 → 拖框选 → 保存）