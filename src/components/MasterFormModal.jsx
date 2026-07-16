import { Modal } from "antd";

export default function MasterFormModal({
  open,
  onClose,
  title,
  formComponent: FormComponent,
  initialData,
  onSubmit,
  loading = false,
}) {
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden // ✅ fixed deprecation
      width={640}
    >
      <FormComponent
        initialData={initialData}
        onSubmit={onSubmit}
        onClose={onClose}
        loading={loading}
      />
    </Modal>
  );
}