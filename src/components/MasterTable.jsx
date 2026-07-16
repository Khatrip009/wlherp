import { useState } from "react";
import { Table, Input, Button, Space, Popconfirm, message } from "antd";
import { SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function MasterTable({
  queryKey,
  queryFn,
  columns,
  searchPlaceholder = "Search...",
  onAdd,
  onEdit,
  onDelete,
  extraActions = null,
}) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  // ✅ queryFn receives { search }
  const { data, isLoading } = useQuery({
    queryKey: [queryKey, search],
    queryFn: () => queryFn({ search }),
    keepPreviousData: true,
  });

  // ✅ Ensure data is an array
  const dataSource = Array.isArray(data) ? data : (data?.data || []);

  const deleteMutation = useMutation({
    mutationFn: onDelete,
    onSuccess: () => {
      message.success("Deleted successfully");
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    },
    onError: (err) => message.error(err.message || "Delete failed"),
  });

  const actionColumn = {
    title: "Actions",
    width: 120,
    render: (_, record) => (
      <Space>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
        <Popconfirm title="Delete this item?" onConfirm={() => deleteMutation.mutate(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ),
  };

  const tableColumns = [...columns, actionColumn];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Input
          placeholder={searchPlaceholder}
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
          allowClear
        />
        <Space>
          {extraActions}
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            Add
          </Button>
        </Space>
      </div>

      <Table
        columns={tableColumns}
        dataSource={dataSource}
        loading={isLoading}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}