// ===== State =====
let selectedApartment = '';

// ===== Elements =====
const pageHome = document.getElementById('page-home');
const pageForm = document.getElementById('page-form');
const pageDone = document.getElementById('page-done');

const inputRoom = document.getElementById('input-room');
const inputName = document.getElementById('input-name');
const inputId = document.getElementById('input-id');
const inputPhone = document.getElementById('input-phone');
const inputNotes = document.getElementById('input-notes');
const submitBtn = document.getElementById('submit-btn');
const formApartmentName = document.getElementById('form-apartment-name');

// ===== Page Navigation =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  page.classList.add('active');
}

// ===== Apartment Selection =====
document.querySelectorAll('.apt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedApartment = btn.dataset.apartment;
    formApartmentName.textContent = selectedApartment + '公寓 · 登记';
    // Clear previous inputs
    inputRoom.value = '';
    inputName.value = '';
    inputId.value = '';
    inputPhone.value = '';
    inputNotes.value = '';
    updateSubmitButton();
    showPage(pageForm);
  });
});

// ===== Back Button =====
function goBack() {
  showPage(pageHome);
}

// ===== Input Validation =====
function updateSubmitButton() {
  const room = inputRoom.value.trim();
  const name = inputName.value.trim();
  const idNumber = inputId.value.trim();
  const phone = inputPhone.value.trim();

  const allFilled = room && name && idNumber && phone;

  if (allFilled) {
    submitBtn.classList.remove('disabled');
    submitBtn.classList.add('active');
    submitBtn.disabled = false;
  } else {
    submitBtn.classList.add('disabled');
    submitBtn.classList.remove('active');
    submitBtn.disabled = true;
  }
}

// Listen for input changes
inputRoom.addEventListener('input', updateSubmitButton);
inputName.addEventListener('input', updateSubmitButton);
inputId.addEventListener('input', updateSubmitButton);
inputPhone.addEventListener('input', updateSubmitButton);

// ===== Submit Registration =====
submitBtn.addEventListener('click', async () => {
  if (submitBtn.disabled) return;

  const data = {
    apartment: selectedApartment,
    room: inputRoom.value.trim(),
    name: inputName.value.trim(),
    idNumber: inputId.value.trim(),
    phone: inputPhone.value.trim(),
    notes: inputNotes.value.trim()
  };

  submitBtn.textContent = '提交中...';
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (result.success) {
      // Go to done page
      showPage(pageDone);
    } else {
      alert('提交失败: ' + result.message);
      submitBtn.textContent = '确认';
      submitBtn.disabled = false;
    }
  } catch (e) {
    alert('网络错误，请重试');
    submitBtn.textContent = '确认';
    submitBtn.disabled = false;
  }
});

// ===== Next Resident =====
// 点击"登记下一位住户"：清空本机表单输入（不影响后台已保存的数据），回到公寓选择页
document.getElementById('next-btn').addEventListener('click', () => {
  // 仅清空前端输入框，后台数据库中的登记数据不受任何影响
  inputRoom.value = '';
  inputName.value = '';
  inputId.value = '';
  inputPhone.value = '';
  inputNotes.value = '';
  selectedApartment = '';
  updateSubmitButton();
  showPage(pageHome);
});

// ===== Init =====
showPage(pageHome);
