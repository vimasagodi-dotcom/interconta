import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Building, MapPin, FileText, User, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { type Client } from "@/lib/clientes";
import { ExternalLink } from "lucide-react";

const nifRegex = /^[0-9]{9}$/;

const clienteSchema = z.object({
  numeroCliente: z.string().trim().min(1, "Número de cliente é obrigatório").max(20, "Número demasiado longo"),
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres").max(200, "Nome demasiado longo"),
  nif: z.string().regex(nifRegex, "NIF deve ter exatamente 9 dígitos numéricos"),
  email: z.string().trim().email("Email inválido").max(255, "Email demasiado longo"),
  phone: z.string().trim().min(9, "Telefone deve ter pelo menos 9 dígitos").max(20, "Telefone demasiado longo"),
  type: z.enum(["ENI", "Lda", "SA", "Unipessoal"], { required_error: "Selecione o tipo de empresa" }),
  status: z.enum(["ativo", "suspenso"]),
  regimeIva: z.enum(["Mensal", "Trimestral", "Isento"], { required_error: "Selecione o regime de IVA" }),
  regime_contabilidade: z.string().optional().or(z.literal("")),
  morada: z.string().trim().max(300, "Morada demasiado longa").optional().or(z.literal("")),
  codigoPostal: z.string().regex(/^[0-9]{4}-[0-9]{3}$/, "Formato: 0000-000").optional().or(z.literal("")),
  localidade: z.string().trim().max(100, "Localidade demasiado longa").optional().or(z.literal("")),
  valorAvenca: z.any().optional(),
  saldo: z.any().optional(),
  dmr: z.boolean().default(false),
  saft: z.boolean().default(false),
  irc: z.boolean().default(false),
  ies: z.boolean().default(false),
  tsu_tipo: z.enum(["Nenhuma", "Empresa", "TI", "Cultura"]).default("Nenhuma"),
  decl_trimestral_tsu: z.boolean().default(false),
  salarios: z.boolean().default(false),
  inventario: z.boolean().default(false),
  modelo_10: z.boolean().default(false),
  inscrito_vies: z.boolean().default(false),
  rcbe: z.string().trim().optional().or(z.literal("")),
  validade_rcbe: z.string().trim().optional().or(z.literal("")),
  codigo_certidao_permanente: z.string().trim().optional().or(z.literal("")),
  validade_certidao_permanente: z.string().trim().optional().or(z.literal("")),
  observacoes: z.string().trim().max(1000, "Observações demasiado longas").optional().or(z.literal("")),
  avenca_automatica: z.boolean().default(true),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

interface ClienteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ClienteFormValues) => void;
  defaultValues?: Partial<ClienteFormValues>;
  mode: "create" | "edit";
  tecnicos?: string[]; 
  client?: Client; // Adicionado para suportar impersonação
}

const ClienteFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  mode,
  tecnicos,
  client,
}: ClienteFormDialogProps) => {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const form = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      numeroCliente: "",
      name: "",
      nif: "",
      email: "",
      phone: "",
      type: "Lda",
      status: "ativo",
      regimeIva: "Trimestral",
      regime_contabilidade: "",
      morada: "",
      codigoPostal: "",
      localidade: "",
      valorAvenca: "",
      saldo: "",
      dmr: false,
      saft: false,
      irc: false,
      ies: false,
      tsu_tipo: "Nenhuma",
      decl_trimestral_tsu: false,
      salarios: false,
      inventario: false,
      modelo_10: false,
      inscrito_vies: false,
      rcbe: "",
      validade_rcbe: "",
      codigo_certidao_permanente: "",
      validade_certidao_permanente: "",
      observacoes: "",
      avenca_automatica: true,
      ...defaultValues,
    },
  });

  const { toast } = useToast();
  const [isSearchingNif, setIsSearchingNif] = useState(false);

  const handleSearchNif = async () => {
    const nif = form.getValues("nif");
    if (!nif || nif.length !== 9) {
      toast({
        title: "NIF Inválido",
        description: "Introduza um NIF com 9 dígitos para pesquisar.",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingNif(true);
    try {
      const targetUrl = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: "PT", vatNumber: nif }),
      });

      const data = await response.json();

      if (data.valid) {
        form.setValue("inscrito_vies", true);
        if (data.name) form.setValue("name", data.name.trim());
        
        if (data.address) {
          const addressLines = data.address.split('\n').map((l: string) => l.trim()).filter(Boolean);
          if (addressLines.length > 0) {
            const lastLine = addressLines[addressLines.length - 1];
            const zipMatch = lastLine.match(/(\d{4}-\d{3})\s+(.*)/);
            if (zipMatch) {
              form.setValue("codigoPostal", zipMatch[1]);
              form.setValue("localidade", zipMatch[2]);
              form.setValue("morada", addressLines.slice(0, -1).join(', '));
            } else {
              form.setValue("morada", data.address.replace(/\n/g, ', '));
            }
          }
        }

        toast({
          title: "Dados encontrados!",
          description: "Os dados públicos da empresa foram preenchidos automágicamente.",
        });
      } else {
        form.setValue("inscrito_vies", false);
        toast({
          title: "Não encontrado no VIES",
          description: "O NIF fornecido não está registado para operações transfronteiriças no VIES.",
        });
      }
    } catch (error) {
      toast({
        title: "Erro na pesquisa",
        description: "Não foi possível contactar o servidor do VIES.",
        variant: "destructive",
      });
    } finally {
      setIsSearchingNif(false);
    }
  };

  const handleImpersonate = () => {
    if (client) {
      impersonate(client);
      onOpenChange(false);
      navigate("/portal");
      toast({
        title: "Modo de Visualização Ativado",
        description: `A entrar no portal como ${client.name}`,
      });
    }
  };

  const handleSubmit = (data: ClienteFormValues) => {
    onSubmit(data);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="w-5 h-5 text-primary" />
            {mode === "create" ? "Novo Cliente" : "Editar Cliente"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Preencha os dados para registar um novo cliente."
              : "Atualize os dados do cliente."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Identificação */}
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-primary" />
                Identificação
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="numeroCliente"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº Cliente *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: C-0001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome / Designação Social *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: TechNova Lda" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>NIF *</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="123456789" maxLength={9} {...field} />
                        </FormControl>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="icon"
                          onClick={handleSearchNif}
                          disabled={isSearchingNif}
                          title="Pesquisar dados da empresa (VIES)"
                        >
                          {isSearchingNif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Empresa *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ENI">ENI - Empresário em Nome Individual</SelectItem>
                          <SelectItem value="Lda">Lda - Sociedade por Quotas</SelectItem>
                          <SelectItem value="SA">SA - Sociedade Anónima</SelectItem>
                          <SelectItem value="Unipessoal">Unipessoal Lda</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="geral@empresa.pt" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone *</FormLabel>
                      <FormControl>
                        <Input placeholder="211234567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Morada */}
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-primary" />
                Morada
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="morada"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Morada</FormLabel>
                      <FormControl>
                        <Input placeholder="Rua, número, andar" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codigoPostal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código Postal</FormLabel>
                      <FormControl>
                        <Input placeholder="0000-000" maxLength={8} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="localidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Localidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Lisboa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Fiscal & Contabilidade */}
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                Dados Fiscais & Contabilidade
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="regimeIva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regime de IVA *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar regime" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mensal">Mensal</SelectItem>
                          <SelectItem value="Trimestral">Trimestral</SelectItem>
                          <SelectItem value="Isento">Isento</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="regime_contabilidade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regime de Contabilidade</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o regime" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="IRC">IRC</SelectItem>
                          <SelectItem value="IRC R. SIMPLIFICADO">IRC R. SIMPLIFICADO</SelectItem>
                          <SelectItem value="IRC Transp. Fiscal">IRC Transp. Fiscal</SelectItem>
                          <SelectItem value="IRS">IRS</SelectItem>
                          <SelectItem value="IRS ORGANIZADA">IRS ORGANIZADA</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valorAvenca"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Valor Avença Mensal (€)</FormLabel>
                        <div className="flex items-center gap-1.5">
                          <Checkbox 
                            checked={form.watch("avenca_automatica")} 
                            onCheckedChange={(checked) => form.setValue("avenca_automatica", !!checked)} 
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Auto</span>
                        </div>
                      </div>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="Ex: 450.00" 
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="saldo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avenças em Dívida (Transitadas €)</FormLabel>
                      <FormControl>
                        <Input 
                          type="text" 
                          placeholder="Ex: 1500.00" 
                          {...field} 
                          value={field.value ?? ""} 
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-1 sm:col-span-2 space-y-4 mt-2">
                  <div className="bg-accent/40 border border-border rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-foreground border-b border-border/50 pb-2">Registo Central do Beneficiário Efetivo (RCBE)</h4>
                    <FormField
                      control={form.control}
                      name="rcbe"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código RCBE</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: 6249ce13-2818..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="validade_rcbe"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data de Alteração</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="bg-accent/40 border border-border rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-foreground border-b border-border/50 pb-2">Certidão Permanente</h4>
                    <FormField
                      control={form.control}
                      name="codigo_certidao_permanente"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Código de Acesso</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: 3305-6555-6009" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="validade_certidao_permanente"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Validade da Certidão</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Obrigações e Relatórios */}
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary" />
                Obrigações e Relatórios
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="dmr" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">DMR</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="saft" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">SAF-T</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="irc" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">IRC</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="ies" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">IES</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="salarios" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">Salários</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="inventario" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">Inventário</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="modelo_10" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">Modelo 10</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="inscrito_vies" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <FormLabel className="text-sm font-medium">Inscrito no VIES</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tsu_tipo" render={({ field }) => (
                  <FormItem className="rounded-lg border border-border p-3 sm:col-span-2">
                    <FormLabel className="text-sm font-medium">TSU</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="mt-2 text-xs h-8">
                          <SelectValue placeholder="Selecione o tipo de TSU" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Nenhuma">Nenhuma</SelectItem>
                        <SelectItem value="Empresa">Empresa</SelectItem>
                        <SelectItem value="TI">Trabalhador Independente (TI)</SelectItem>
                        <SelectItem value="Cultura">Profissionais da Cultura</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                {form.watch("tsu_tipo") === "TI" && (
                  <FormField control={form.control} name="decl_trimestral_tsu" render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
                      <FormLabel className="text-sm font-medium text-primary">Declaração Trimestral TSU</FormLabel>
                      <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                )}
              </div>
            </div>

            <Separator />

            {/* Observações */}
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notas internas sobre o cliente..."
                      className="min-h-[80px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between pt-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Switch
                        checked={field.value === "ativo"}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? "ativo" : "suspenso")
                        }
                      />
                    </FormControl>
                    <FormLabel className="text-sm font-medium cursor-pointer m-0">Cliente Ativo</FormLabel>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-3">
                {mode === "edit" && client && (
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2 border-accent/30 text-accent hover:bg-accent/5"
                    onClick={handleImpersonate}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Aceder ao Portal
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {mode === "create" ? "Criar Cliente" : "Guardar Alterações"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ClienteFormDialog;
