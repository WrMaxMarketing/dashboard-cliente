"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DollarSign,
  ShoppingCart,
  Users,
  RefreshCw,
  Phone,
  Mail,
  TrendingUp,
  LogOut,
  Loader2,
  PiggyBank,
  BarChart3,
} from "lucide-react"
import { useAuth } from "@/context/auth-context"
import Image from "next/image"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"

interface SalesData {
  "Data da Compra": string
  "Data do Envio": string
  Nome: string
  Telefone: string
  "E-mail": string
  Produto: string
  Valor: string
  "Comissão Kiwify": string
}

export default function Dashboard() {
  const { user, signOut, loading: authLoading } = useAuth()
  const router = useRouter()
  const [pixGeradoData, setPixGeradoData] = useState<SalesData[]>([])
  const [compraAprovadaData, setCompraAprovadaData] = useState<SalesData[]>([])
  const [carrinhoAbandonadoData, setCarrinhoAbandonadoData] = useState<SalesData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState("pix-gerado")

  const GOOGLE_SHEET_ID = "14vavW-teiHKqeKFQC-5eFNA5Vj0WqIQEdEce8vIhGUw"

  const sheetTabs = [
    { id: "pix-gerado", name: "Pix\nGerado", endpoint: "Pix%20Gerado" },
    { id: "compra-aprovada", name: "Compra\nAprovada", endpoint: "Compra%20Aprovada" },
    { id: "carrinho-abandonado", name: "Carrinho\nAbandonado", endpoint: "Carrinho%20Abandonado" },
  ]

  const fetchData = useCallback(
    async (endpoint: string) => {
      try {
        const url = `https://opensheet.elk.sh/${GOOGLE_SHEET_ID}/${endpoint}`
        console.log(`Buscando dados de: ${url}`)

        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`)
        }

        const data = await response.json()

        if (!Array.isArray(data)) {
          console.warn(`Dados inválidos recebidos para ${endpoint}:`, data)
          return []
        }

        const validData = data.filter((item: any) => {
          if (!item || typeof item !== "object") return false
          return Object.values(item).some(
            (value) => value !== null && value !== undefined && String(value).trim() !== "",
          )
        })

        console.log(`Dados carregados para ${endpoint}: ${validData.length} linhas`)
        return validData
      } catch (error) {
        console.error(`Erro ao buscar dados de ${endpoint}:`, error)
        if (error instanceof Error) {
          if (error.message.includes("404")) {
            console.error("Possível causa: Planilha não encontrada ou não é pública")
          } else if (error.message.includes("403")) {
            console.error("Possível causa: Planilha não tem permissões públicas")
          }
        }
        return []
      }
    },
    [GOOGLE_SHEET_ID],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [pixData, compraData, carrinhoData] = await Promise.all([
        fetchData("Pix%20Gerado"),
        fetchData("Compra%20Aprovada"),
        fetchData("Carrinho%20Abandonado"),
      ])

      setPixGeradoData(pixData)
      setCompraAprovadaData(compraData)
      setCarrinhoAbandonadoData(carrinhoData)
      setLastUpdated(new Date())
      console.log(`Total de linhas Pix Gerado (após carregamento): ${pixData.length}`)
    } catch (error) {
      console.error("Erro ao carregar todos os dados:", error)
    } finally {
      setLoading(false)
    }
  }, [fetchData])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSignOut = async () => {
    await signOut()
    router.push("/")
  }

  const processChartData = useCallback(() => {
    if (!compraAprovadaData.length) return { salesByDate: [] }

    // Vendas por data
    const salesByDate = compraAprovadaData
      .reduce((acc: any[], item) => {
        const date = item["Data da Compra"]
        if (!date) return acc

        const formattedDate = new Date(date).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        })

        const existing = acc.find((d) => d.date === formattedDate)
        const valor = Number.parseFloat(item.Valor?.replace(/[^\d,]/g, "").replace(",", ".") || "0")

        if (existing) {
          existing.vendas += valor
          existing.quantidade += 1
        } else {
          acc.push({ date: formattedDate, vendas: valor, quantidade: 1 })
        }

        return acc
      }, [])
      .slice(-7) // Últimos 7 dias

    return { salesByDate }
  }, [compraAprovadaData])

  const chartData = processChartData()

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-700">Verificando autenticação...</span>
      </div>
    )
  }

  const filteredData = pixGeradoData.filter(
    (item) =>
      item.Nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item["E-mail"]?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Produto?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalValue = pixGeradoData.reduce((sum, item) => {
    const value = Number.parseFloat(item.Valor?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0
    return sum + value
  }, 0)

  const totalCommission = pixGeradoData.reduce((sum, item) => {
    const commission = Number.parseFloat(item["Comissão Kiwify"]?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0
    return sum + commission
  }, 0)

  const totalLiquido = totalValue - totalCommission

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        const parts = dateString.split("/")
        if (parts.length === 3) {
          const [day, month, year] = parts
          const formattedDate = new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
          return formattedDate.toLocaleDateString("pt-BR")
        }
        return dateString
      }
      return date.toLocaleDateString("pt-BR")
    } catch {
      return dateString
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-xl shadow-sm p-4 sm:p-6 border border-blue-100">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <Image
                src="/logo-196-sonhos.jpeg"
                alt="196 Sonhos"
                width={60}
                height={60}
                className="rounded-lg"
                priority
              />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Dashboard do Influencer
              </h1>
              <p className="text-blue-600 font-medium">196 SONHOS - Painel de Vendas</p>
              <p className="text-sm text-gray-500">Bem-vindo, {user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={loadData}
              disabled={loading}
              variant="outline"
              size="sm"
              className="border-blue-200 hover:bg-blue-50 bg-transparent"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              onClick={handleSignOut}
              variant="outline"
              size="sm"
              className="border-red-200 hover:bg-red-50 text-red-600 bg-transparent"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
            {lastUpdated && (
              <span className="text-sm text-gray-500">
                Última atualização: {lastUpdated.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700">Total Bruto</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">{formatCurrency(totalValue)}</div>
              <p className="text-xs text-green-600">Soma de todas as vendas</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-700">Total Líquido</CardTitle>
              <PiggyBank className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-700">{formatCurrency(totalLiquido)}</div>
              <p className="text-xs text-blue-600">Bruto - Comissões</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-700">Total de Pedidos</CardTitle>
              <ShoppingCart className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-700">{pixGeradoData.length}</div>
              <p className="text-xs text-purple-600">Número total de transações</p>
            </CardContent>
          </Card>

          <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-indigo-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-indigo-700">Clientes Únicos</CardTitle>
              <Users className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-700">
                {new Set(pixGeradoData.map((item) => item["E-mail"])).size}
              </div>
              <p className="text-xs text-indigo-600">Baseado em emails únicos</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-700">Total Comissões</CardTitle>
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-700">{formatCurrency(totalCommission)}</div>
              <p className="text-xs text-orange-600">Comissões pagas</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Resumo de Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{formatCurrency(totalValue / pixGeradoData.length || 0)}</div>
                <p className="text-blue-100">Ticket Médio</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{((totalCommission / totalValue) * 100 || 0).toFixed(1)}%</div>
                <p className="text-blue-100">Taxa de Comissão</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{((totalLiquido / totalValue) * 100 || 0).toFixed(1)}%</div>
                <p className="text-blue-100">Margem Líquida</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 sm:mb-8">
          <Card className="p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">Vendas dos Últimos 7 Dias</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData.salesByDate}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} tick={{ fontSize: 12 }} />
                <YAxis fontSize={12} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    name === "vendas" ? `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : value,
                    name === "vendas" ? "Vendas" : "Quantidade",
                  ]}
                />
                <Line type="monotone" dataKey="vendas" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 h-auto">
            {sheetTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-md text-xs sm:text-sm py-2 px-1 sm:px-3 whitespace-pre-line text-center leading-tight"
              >
                {tab.name}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="pix-gerado" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Pix Gerado</span>
                  <span className="text-sm font-normal text-gray-600">Total: {pixGeradoData.length}</span>
                </CardTitle>
                <p className="text-sm text-gray-500">👈 Deslize para ver todos os dados</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold min-w-[100px]">Data da Compra</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Nome</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Produto</TableHead>
                        <TableHead className="text-right font-semibold min-w-[80px]">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
                          <span className="ml-2 text-gray-600">Carregando dados...</span>
                        </div>
                      ) : (
                        <div className="rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead className="font-semibold">Data da Compra</TableHead>
                                <TableHead className="font-semibold">Nome</TableHead>
                                <TableHead className="font-semibold">Produto</TableHead>
                                <TableHead className="text-right font-semibold">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredData.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                                    {searchTerm ? "Nenhum resultado encontrado" : "Nenhum dado disponível"}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredData.map((item, index) => (
                                  <TableRow key={index} className="hover:bg-blue-50/50">
                                    <TableCell className="font-medium">{formatDate(item["Data da Compra"])}</TableCell>
                                    <TableCell>
                                      <div className="font-medium">{item.Nome || "N/A"}</div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                        {item.Produto || "N/A"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium text-green-600">
                                      {item.Valor
                                        ? formatCurrency(
                                            Number.parseFloat(item.Valor.replace(/[^\d.,]/g, "").replace(",", ".")) ||
                                              0,
                                          )
                                        : "N/A"}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compra-aprovada" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Compra Aprovada</span>
                  <span className="text-sm font-normal text-gray-600">Total: {compraAprovadaData.length}</span>
                </CardTitle>
                <p className="text-sm text-gray-500">👈 Deslize para ver todos os dados</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold min-w-[100px]">Data da Compra</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Data do Envio</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Nome</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Contato</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Produto</TableHead>
                        <TableHead className="text-right font-semibold min-w-[80px]">Valor</TableHead>
                        <TableHead className="text-right font-semibold min-w-[80px]">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                          <span className="ml-2 text-gray-600">Carregando dados...</span>
                        </div>
                      ) : compraAprovadaData.length > 0 ? (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data da Compra</TableHead>
                                <TableHead>Data do Envio</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>Contato</TableHead>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                                <TableHead className="text-right">Comissão</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {compraAprovadaData.map((item, index) => (
                                <TableRow key={index}>
                                  <TableCell>{formatDate(item["Data da Compra"])}</TableCell>
                                  <TableCell>{formatDate(item["Data do Envio"])}</TableCell>
                                  <TableCell>{item.Nome}</TableCell>
                                  <TableCell>
                                    <div className="space-y-1">
                                      {item.Telefone && (
                                        <div className="flex items-center text-sm text-gray-600">
                                          <Phone className="h-3 w-3 mr-1" />
                                          {item.Telefone}
                                        </div>
                                      )}
                                      {item["E-mail"] && (
                                        <div className="flex items-center text-sm text-gray-600">
                                          <Mail className="h-3 w-3 mr-1" />
                                          {item["E-mail"]}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary">{item.Produto}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-green-600">
                                    {formatCurrency(
                                      Number.parseFloat(item.Valor?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-orange-600">
                                    {formatCurrency(
                                      Number.parseFloat(
                                        item["Comissão Kiwify"].replace(/[^\d.,]/g, "").replace(",", "."),
                                      ) || 0,
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">Nenhum dado de compra aprovada disponível</div>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="carrinho-abandonado" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex justify-between items-center">
                  <span>Carrinho Abandonado</span>
                  <span className="text-sm font-normal text-gray-600">Total: {carrinhoAbandonadoData.length}</span>
                </CardTitle>
                <p className="text-sm text-gray-500">👈 Deslize para ver todos os dados</p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold min-w-[80px]">Data</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Nome</TableHead>
                        <TableHead className="font-semibold min-w-[150px]">E-mail</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Produto</TableHead>
                        <TableHead className="text-right font-semibold min-w-[80px]">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
                          <span className="ml-2 text-gray-600">Carregando dados...</span>
                        </div>
                      ) : carrinhoAbandonadoData.length > 0 ? (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>E-mail</TableHead>
                                <TableHead>Produto</TableHead>
                                <TableHead className="text-right">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {carrinhoAbandonadoData.map((item, index) => (
                                <TableRow key={index}>
                                  <TableCell>{formatDate(item["Data da Compra"])}</TableCell>
                                  <TableCell>{item.Nome}</TableCell>
                                  <TableCell>{item["E-mail"]}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline">{item.Produto}</Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-red-600">
                                    {formatCurrency(
                                      Number.parseFloat(item.Valor?.replace(/[^\d.,]/g, "").replace(",", ".")) || 0,
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          Nenhum dado de carrinho abandonado disponível
                        </div>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
