import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import QueryRewards from './pages/QueryRewards';
import CalculateRewards from './pages/CalculateRewards';
import Transactions from './pages/Transactions';
import QuotaQuery from './pages/QuotaQuery';
import Settings from './pages/settings/Settings';
import ImportData from './pages/ImportData';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/query" replace />} />
        <Route path="/query" element={<QueryRewards />} />
        <Route path="/calculate" element={<CalculateRewards />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/quota" element={<QuotaQuery />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/import" element={<ImportData />} />
      </Routes>
    </Layout>
  );
}

export default App;


