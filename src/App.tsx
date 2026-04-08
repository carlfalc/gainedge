import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Signup from "./pages/Signup.tsx";
import NotFound from "./pages/NotFound.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import DashboardHome from "./pages/dashboard/DashboardHome.tsx";
import SignalsPage from "./pages/dashboard/SignalsPage.tsx";
import JournalPage from "./pages/dashboard/JournalPage.tsx";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage.tsx";
import InsightsPage from "./pages/dashboard/InsightsPage.tsx";
import BacktestingPage from "./pages/dashboard/BacktestingPage.tsx";
import CalendarPage from "./pages/dashboard/CalendarPage.tsx";
import SettingsPage from "./pages/dashboard/SettingsPage.tsx";
import ClockSettingsPage from "./pages/dashboard/ClockSettingsPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="signals" element={<SignalsPage />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="backtesting" element={<BacktestingPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="clock-settings" element={<ClockSettingsPage />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
