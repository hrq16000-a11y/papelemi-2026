import logoImg from "@/assets/logo.webp";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Lock, Mail, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

const AdminLogin = () => {
  const navigate = useNavigate();
  const { signIn, signOut, user, isAdmin, adminChecked, loading } = useAuth();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect once role check completes
  useEffect(() => {
    if (loading || !user || !adminChecked) return;
    if (isAdmin) navigate('/admin', { replace: true });
    else navigate('/acesso-restrito', { replace: true });
  }, [user, isAdmin, adminChecked, loading, navigate]);

  const validateForm = () => {
    try {
      loginSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        err.issues.forEach((e) => {
          if (e.path[0]) {
            fieldErrors[e.path[0] as string] = e.message;
          }
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const { error } = await signIn(formData.email, formData.password);
      if (error) {
        toast({
          title: 'Erro ao fazer login',
          description: 'Email ou senha incorretos.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Login realizado com sucesso!',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || (user && !adminChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream to-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground font-medium">Verificando permissões de acesso...</p>
        </div>
      </div>
    );
  }

  // If logged in but not admin
  if (user && adminChecked && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream to-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-display text-foreground">Acesso Restrito</CardTitle>
            <CardDescription>
              Sua conta não possui permissões de administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">E-mail autenticado:</span> <strong className="break-all">{user.email}</strong></div>
              <div><span className="text-muted-foreground">Provedor:</span> {user.app_metadata?.provider || '—'}</div>
              <div><span className="text-muted-foreground">Role admin:</span> <strong className="text-destructive">não</strong></div>
              <div className="text-xs text-muted-foreground pt-1">ID: <code className="text-[10px]">{user.id}</code></div>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Peça ao administrador atual para promover este e-mail em <code>/admin/usuarios</code>.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={async () => { await signOut(); }}>
                Trocar de conta
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate('/')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao site
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cream to-background p-4">
      <Card className="w-full max-w-md shadow-medium">
        <CardHeader className="text-center space-y-2">
          <Link to="/" className="inline-block">
            <div className="w-24 h-24 mx-auto rounded-full bg-white shadow-lg ring-2 ring-primary/20 flex items-center justify-center overflow-hidden">
              <img src={logoImg} alt="PapeLemi" className="w-full h-full object-contain p-2" />
            </div>
          </Link>
          <CardTitle className="text-2xl font-display text-foreground">
            Área Administrativa
          </CardTitle>
          <CardDescription>
            Faça login para acessar o painel
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  className="pl-10"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Processando...' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              Voltar ao site
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
